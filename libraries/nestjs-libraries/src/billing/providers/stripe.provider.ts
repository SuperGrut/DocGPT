import { ConfigService } from "@nestjs/config";
import type { SubscriptionStatus } from "@prisma/client";

import {
  BillingProvider,
  CheckoutInput,
  CheckoutSession,
  InvalidWebhookError,
  NormalizedEvent,
  NormalizedSubscription,
  PaymentProvider,
  WebhookHeaders,
} from "./payment-provider.interface";
import {
  asInterval,
  formEncode,
  header,
  hmac,
  requestJson,
  safeEqual,
  unixToDate,
} from "./provider-utils";

const STATUS: Record<string, SubscriptionStatus> = {
  incomplete: "INCOMPLETE",
  incomplete_expired: "EXPIRED",
  trialing: "ACTIVE",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE", // retries exhausted; the grace window in entitlements ends access
  paused: "PAUSED",
  canceled: "CANCELED",
};

const TOLERANCE_SEC = 300;

interface StripeSubscription {
  id: string;
  status: string;
  customer: string | { id: string };
  metadata?: Record<string, string>;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number; // older API versions
  items?: {
    data: {
      id: string;
      current_period_end?: number; // newer API versions moved it here
      price?: { id: string; recurring?: { interval?: string } };
    }[];
  };
}

@BillingProvider({ provider: "stripe" })
export class StripeProvider extends PaymentProvider {
  readonly name = "stripe";
  readonly capabilities = { portal: true, changePlan: true, resume: true };

  constructor(private readonly config: ConfigService) {
    super();
  }

  // Getters keep config lazy, so an install that doesn't use Stripe never needs these env vars.
  private get secretKey() {
    return this.config.getOrThrow<string>("STRIPE_SECRET_KEY");
  }
  private get webhookSecret() {
    return this.config.getOrThrow<string>("STRIPE_WEBHOOK_SECRET");
  }

  validate(): void {
    void this.secretKey;
    void this.webhookSecret;
  }

  private call<T>(
    method: "GET" | "POST",
    path: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
    };
    const version = this.config.get<string>("STRIPE_API_VERSION");
    if (version) headers["Stripe-Version"] = version;

    let body: string | undefined;
    if (params) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = formEncode(params);
    }
    return requestJson<T>(`https://api.stripe.com/v1${path}`, {
      method,
      headers,
      body,
    });
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const metadata = {
      userId: input.userId,
      planKey: input.planKey,
      interval: input.interval,
    };
    const session = await this.call<{ url: string }>(
      "POST",
      "/checkout/sessions",
      {
        mode: "subscription",
        line_items: [{ price: input.providerPriceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.userId,
        ...(input.providerCustomerId
          ? { customer: input.providerCustomerId }
          : { customer_email: input.email }),
        subscription_data: { metadata },
        metadata,
        allow_promotion_codes: true,
      },
    );
    return { type: "redirect", url: session.url };
  }

  async getSubscription(id: string): Promise<NormalizedSubscription> {
    const s = await this.call<StripeSubscription>(
      "GET",
      `/subscriptions/${encodeURIComponent(id)}`,
    );
    const item = s.items?.data?.[0];
    return {
      providerSubscriptionId: s.id,
      providerCustomerId:
        typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
      userId: s.metadata?.userId ?? null,
      providerPriceId: item?.price?.id ?? null,
      planKey: s.metadata?.planKey ?? null,
      interval:
        asInterval(item?.price?.recurring?.interval) ??
        asInterval(s.metadata?.interval),
      status: STATUS[s.status] ?? "INCOMPLETE",
      currentPeriodEnd: unixToDate(
        item?.current_period_end ?? s.current_period_end,
      ),
      cancelAtPeriodEnd: Boolean(s.cancel_at_period_end || s.cancel_at),
    };
  }

  async scheduleCancellation(id: string): Promise<void> {
    await this.call("POST", `/subscriptions/${encodeURIComponent(id)}`, {
      cancel_at_period_end: true,
    });
  }

  async unscheduleCancellation(id: string): Promise<void> {
    await this.call("POST", `/subscriptions/${encodeURIComponent(id)}`, {
      cancel_at_period_end: false,
    });
  }

  async changePlan(id: string, priceId: string): Promise<void> {
    const s = await this.call<StripeSubscription>(
      "GET",
      `/subscriptions/${encodeURIComponent(id)}`,
    );
    const item = s.items?.data?.[0];
    if (!item) throw new Error(`Stripe subscription ${id} has no items`);
    await this.call("POST", `/subscriptions/${encodeURIComponent(id)}`, {
      items: [{ id: item.id, price: priceId }],
      proration_behavior: "create_prorations",
    });
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<string> {
    // Needs a Customer Portal configuration saved once in the Stripe dashboard.
    const session = await this.call<{ url: string }>(
      "POST",
      "/billing_portal/sessions",
      {
        customer: customerId,
        return_url: returnUrl,
      },
    );
    return session.url;
  }

  parseWebhook(raw: Buffer, headers: WebhookHeaders): NormalizedEvent {
    const signature = header(headers, "stripe-signature");
    if (!signature) throw new InvalidWebhookError();

    let timestamp = "";
    const candidates: string[] = [];
    for (const part of signature.split(",")) {
      const [key, value] = part.split("=");
      if (key === "t") timestamp = value ?? "";
      else if (key === "v1" && value) candidates.push(value);
    }

    const expected = hmac(
      this.webhookSecret,
      `${timestamp}.${raw.toString("utf8")}`,
      "hex",
    );
    if (!timestamp || !candidates.some((c) => safeEqual(c, expected)))
      throw new InvalidWebhookError();
    if (!(Math.abs(Date.now() / 1000 - Number(timestamp)) <= TOLERANCE_SEC)) {
      throw new InvalidWebhookError("Webhook timestamp out of range");
    }

    const event = JSON.parse(raw.toString("utf8")) as {
      id: string;
      type: string;
      data?: { object?: Record<string, any> };
    };
    return {
      eventId: event.id,
      type: event.type,
      providerSubscriptionId: subscriptionIdOf(
        event.type,
        event.data?.object ?? {},
      ),
    };
  }
}

function subscriptionIdOf(
  type: string,
  object: Record<string, any>,
): string | null {
  if (type.startsWith("customer.subscription.")) {
    return typeof object.id === "string" ? object.id : null;
  }
  if (type === "checkout.session.completed") {
    return object.mode === "subscription" &&
      typeof object.subscription === "string"
      ? object.subscription
      : null;
  }
  if (type.startsWith("invoice.")) {
    const id =
      object.subscription ?? object.parent?.subscription_details?.subscription;
    return typeof id === "string" ? id : null;
  }
  return null;
}
