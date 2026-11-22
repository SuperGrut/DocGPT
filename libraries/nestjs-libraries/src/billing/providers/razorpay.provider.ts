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
  sha256Hex,
  unixToDate,
} from "./provider-utils";

const STATUS: Record<string, SubscriptionStatus> = {
  created: "INCOMPLETE",
  authenticated: "INCOMPLETE", // mandate approved, first charge not made yet
  active: "ACTIVE",
  pending: "PAST_DUE", // a charge failed and is being retried
  halted: "PAST_DUE", // retries exhausted; the grace window in entitlements ends access
  paused: "PAUSED",
  cancelled: "CANCELED",
  completed: "EXPIRED",
  expired: "EXPIRED",
};

interface RazorpaySubscription {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_end?: number | null;
  charge_at?: number | null;
  notes?: unknown;
}

@BillingProvider({ provider: "razorpay" })
export class RazorpayProvider extends PaymentProvider {
  readonly name = "razorpay";
  // No hosted portal. UPI and eMandate subscriptions can't be changed by the merchant, and a paused UPI
  // subscription can only be resumed by the customer. changePlan fails for those and the service reports it.
  readonly capabilities = { portal: false, changePlan: true, resume: false };

  constructor(private readonly config: ConfigService) {
    super();
  }

  private get keyId() {
    return this.config.getOrThrow<string>("RAZORPAY_KEY_ID");
  }
  private get keySecret() {
    return this.config.getOrThrow<string>("RAZORPAY_KEY_SECRET");
  }
  private get webhookSecret() {
    return this.config.getOrThrow<string>("RAZORPAY_WEBHOOK_SECRET");
  }

  validate(): void {
    void this.keyId;
    void this.keySecret;
    void this.webhookSecret;
  }

  private call<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
      "base64",
    );
    return requestJson<T>(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    // total_count is the number of billing cycles before the subscription completes on its own.
    const totalCount = Number(
      this.config.get(`RAZORPAY_TOTAL_COUNT_${input.interval.toUpperCase()}`) ??
        (input.interval === "year" ? 10 : 120),
    );
    const sub = await this.call<{ id: string }>("POST", "/subscriptions", {
      plan_id: input.providerPriceId,
      total_count: totalCount,
      customer_notify: 1,
      notes: {
        userId: input.userId,
        planKey: input.planKey,
        interval: input.interval,
      },
    });
    return {
      type: "razorpay",
      keyId: this.keyId,
      subscriptionId: sub.id,
      prefill: {
        email: input.email,
        ...(input.name ? { name: input.name } : {}),
      },
    };
  }

  async getSubscription(id: string): Promise<NormalizedSubscription> {
    const s = await this.call<RazorpaySubscription>(
      "GET",
      `/subscriptions/${encodeURIComponent(id)}`,
    );
    const notes = asStringRecord(s.notes);
    return {
      providerSubscriptionId: s.id,
      providerCustomerId: s.customer_id ?? null,
      userId: notes.userId ?? null,
      providerPriceId: s.plan_id,
      planKey: notes.planKey ?? null,
      interval: asInterval(notes.interval),
      status: STATUS[s.status] ?? "INCOMPLETE",
      currentPeriodEnd: unixToDate(s.current_end ?? s.charge_at),
      cancelAtPeriodEnd: null, // not reported reliably; the service records it when we cancel
    };
  }

  async scheduleCancellation(id: string): Promise<void> {
    await this.call("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, {
      cancel_at_cycle_end: 1,
    });
  }

  async changePlan(id: string, priceId: string): Promise<void> {
    await this.call("PATCH", `/subscriptions/${encodeURIComponent(id)}`, {
      plan_id: priceId,
      schedule_change_at:
        this.config.get<string>("RAZORPAY_PLAN_CHANGE_AT") ?? "cycle_end",
      customer_notify: 1,
    });
  }

  parseWebhook(raw: Buffer, headers: WebhookHeaders): NormalizedEvent {
    const signature = header(headers, "x-razorpay-signature");
    if (!signature) throw new InvalidWebhookError();
    if (!safeEqual(signature, hmac(this.webhookSecret, raw, "hex")))
      throw new InvalidWebhookError();

    const event = JSON.parse(raw.toString("utf8")) as {
      event: string;
      payload?: { subscription?: { entity?: { id?: string } } };
    };
    const id = event.event.startsWith("subscription.")
      ? event.payload?.subscription?.entity?.id
      : undefined;
    return {
      eventId: header(headers, "x-razorpay-event-id") ?? sha256Hex(raw),
      type: event.event,
      providerSubscriptionId: id ?? null,
    };
  }
}
