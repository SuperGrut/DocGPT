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
  asStringRecord,
  header,
  hmac,
  requestJson,
  safeEqual,
} from "./provider-utils";

const STATUS: Record<string, SubscriptionStatus> = {
  pending: "INCOMPLETE",
  active: "ACTIVE",
  on_hold: "PAST_DUE",
  paused: "PAUSED",
  cancelled: "CANCELED",
  failed: "EXPIRED",
  expired: "EXPIRED",
};

const TOLERANCE_SEC = 300;

interface DodoSubscription {
  subscription_id: string;
  status: string;
  product_id: string;
  customer?: { customer_id?: string } | null;
  next_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean;
  payment_frequency_interval?: string;
  metadata?: unknown;
}

@BillingProvider({ provider: "dodo" })
export class DodoProvider extends PaymentProvider {
  readonly name = "dodo";
  readonly capabilities = { portal: true, changePlan: true, resume: true };

  constructor(private readonly config: ConfigService) {
    super();
  }

  private get apiKey() {
    return this.config.getOrThrow<string>("DODO_PAYMENTS_API_KEY");
  }
  private get webhookKey() {
    return this.config.getOrThrow<string>("DODO_PAYMENTS_WEBHOOK_KEY");
  }
  private get baseUrl() {
    // "test_mode" or "live_mode": test keys only work on the test host and live keys on the live host.
    return this.config.getOrThrow<string>("DODO_PAYMENTS_ENVIRONMENT") ===
      "live_mode"
      ? "https://live.dodopayments.com"
      : "https://test.dodopayments.com";
  }

  validate(): void {
    void this.apiKey;
    void this.webhookKey;
    void this.baseUrl;
  }

  private call<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<T> {
    return requestJson<T>(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const session = await this.call<{ checkout_url: string }>(
      "POST",
      "/checkouts",
      {
        product_cart: [{ product_id: input.providerPriceId, quantity: 1 }],
        customer: input.providerCustomerId
          ? { customer_id: input.providerCustomerId }
          : {
              email: input.email,
              name: input.name || input.email.split("@")[0],
            },
        // Dodo is the merchant of record, so it needs the buyer's country to calculate tax.
        billing_address: { country: input.billingCountry },
        return_url: input.successUrl,
        metadata: {
          userId: input.userId,
          planKey: input.planKey,
          interval: input.interval,
        },
      },
    );
    return { type: "redirect", url: session.checkout_url };
  }

  async getSubscription(id: string): Promise<NormalizedSubscription> {
    const s = await this.call<DodoSubscription>(
      "GET",
      `/subscriptions/${encodeURIComponent(id)}`,
    );
    const metadata = asStringRecord(s.metadata);
    return {
      providerSubscriptionId: s.subscription_id,
      providerCustomerId: s.customer?.customer_id ?? null,
      userId: metadata.userId ?? null,
      providerPriceId: s.product_id,
      planKey: metadata.planKey ?? null,
      interval:
        asInterval(s.payment_frequency_interval) ??
        asInterval(metadata.interval),
      status: STATUS[s.status] ?? "INCOMPLETE",
      currentPeriodEnd: s.next_billing_date
        ? new Date(s.next_billing_date)
        : null,
      // A period-end cancellation leaves status "active", so this flag is what tells us.
      cancelAtPeriodEnd: s.cancel_at_next_billing_date ?? null,
    };
  }

  async scheduleCancellation(id: string): Promise<void> {
    await this.call("PATCH", `/subscriptions/${encodeURIComponent(id)}`, {
      cancel_at_next_billing_date: true,
    });
  }

  async unscheduleCancellation(id: string): Promise<void> {
    await this.call("PATCH", `/subscriptions/${encodeURIComponent(id)}`, {
      cancel_at_next_billing_date: false,
    });
  }

  async changePlan(id: string, productId: string): Promise<void> {
    await this.call(
      "POST",
      `/subscriptions/${encodeURIComponent(id)}/change-plan`,
      {
        product_id: productId,
        quantity: 1,
        proration_billing_mode:
          this.config.get<string>("DODO_PRORATION_MODE") ??
          "prorated_immediately",
      },
    );
  }

  async createPortalSession(
    customerId: string,
    _returnUrl: string,
  ): Promise<string> {
    const session = await this.call<{ link: string }>(
      "POST",
      `/customers/${encodeURIComponent(customerId)}/customer-portal/session`,
    );
    return session.link;
  }

  /** Standard Webhooks: HMAC-SHA256 over "{id}.{timestamp}.{body}" with the base64-decoded secret. */
  parseWebhook(raw: Buffer, headers: WebhookHeaders): NormalizedEvent {
    const id = header(headers, "webhook-id");
    const timestamp = header(headers, "webhook-timestamp");
    const signatures = header(headers, "webhook-signature");
    if (!id || !timestamp || !signatures) throw new InvalidWebhookError();
    if (!(Math.abs(Date.now() / 1000 - Number(timestamp)) <= TOLERANCE_SEC)) {
      throw new InvalidWebhookError("Webhook timestamp out of range");
    }

    const secret = Buffer.from(
      this.webhookKey.replace(/^whsec_/, ""),
      "base64",
    );
    const expected = hmac(
      secret,
      `${id}.${timestamp}.${raw.toString("utf8")}`,
      "base64",
    );
    const valid = signatures.split(" ").some((part) => {
      const [version, signature] = part.split(",");
      return version === "v1" && !!signature && safeEqual(signature, expected);
    });
    if (!valid) throw new InvalidWebhookError();

    const body = JSON.parse(raw.toString("utf8")) as {
      type?: string;
      data?: { subscription_id?: unknown };
    };
    const subscriptionId = body.data?.subscription_id;
    return {
      eventId: id,
      type: body.type ?? "unknown",
      providerSubscriptionId:
        typeof subscriptionId === "string" ? subscriptionId : null,
    };
  }
}
