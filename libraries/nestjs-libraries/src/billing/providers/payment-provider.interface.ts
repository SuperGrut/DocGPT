import { Injectable } from "@nestjs/common";
import type { SubscriptionStatus } from "@prisma/client";

import type { Interval, PaidPlanKey } from "../plans/plans.catalog";

export type WebhookHeaders = Record<string, string | string[] | undefined>;

export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedOperationError";
  }
}

export class InvalidWebhookError extends Error {
  constructor(message = "Invalid webhook") {
    super(message);
    this.name = "InvalidWebhookError";
  }
}

/** A call to the provider's API failed. `status` is the HTTP status when there was a response. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderCapabilities {
  /** Hosted page where the customer manages their subscription. */
  portal: boolean;
  changePlan: boolean;
  /** Undo a scheduled cancellation. */
  resume: boolean;
}

export interface CheckoutInput {
  userId: string;
  email: string;
  name?: string | null;
  planKey: PaidPlanKey;
  interval: Interval;
  providerPriceId: string;
  /** ISO 3166-1 alpha-2. */
  billingCountry: string;
  providerCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export type CheckoutSession =
  | { type: "redirect"; url: string }
  /** Razorpay opens its own checkout modal in the browser instead of redirecting. */
  | {
      type: "razorpay";
      keyId: string;
      subscriptionId: string;
      prefill: { email: string; name?: string };
    };

export interface NormalizedSubscription {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  /** From the metadata we attach at checkout. */
  userId: string | null;
  providerPriceId: string | null;
  planKey: string | null;
  interval: Interval | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  /** null = the provider doesn't report it, so the stored value is kept. */
  cancelAtPeriodEnd: boolean | null;
}

export interface NormalizedEvent {
  /** Unique per delivery, used to deduplicate. */
  eventId: string;
  /** The provider's own event name, for logs. */
  type: string;
  /** null = the event isn't about a subscription, nothing to sync. */
  providerSubscriptionId: string | null;
}

export abstract class PaymentProvider {
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;

  /** Called at boot for enabled providers. Throw if config is missing. */
  validate(): void {}

  abstract createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  abstract getSubscription(
    providerSubscriptionId: string,
  ): Promise<NormalizedSubscription>;
  /** Cancel at the end of the paid period. Access continues until then. */
  abstract scheduleCancellation(providerSubscriptionId: string): Promise<void>;
  /** Verifies the signature and returns a thin event. Throws InvalidWebhookError if it isn't genuine. */
  abstract parseWebhook(raw: Buffer, headers: WebhookHeaders): NormalizedEvent;

  unscheduleCancellation(_providerSubscriptionId: string): Promise<void> {
    return Promise.reject(
      new UnsupportedOperationError(
        `${this.name} can't undo a scheduled cancellation`,
      ),
    );
  }
  changePlan(
    _providerSubscriptionId: string,
    _providerPriceId: string,
  ): Promise<void> {
    return Promise.reject(
      new UnsupportedOperationError(
        `${this.name} can't change plans through the API`,
      ),
    );
  }
  createPortalSession(
    _providerCustomerId: string,
    _returnUrl: string,
  ): Promise<string> {
    return Promise.reject(
      new UnsupportedOperationError(
        `${this.name} has no hosted customer portal`,
      ),
    );
  }
}

export interface BillingProviderRegistration {
  target: any;
  provider: string;
}

export const BILLING_PROVIDER_METADATA = "billing-provider";

export function BillingProvider(params: { provider: string }) {
  return function (target: any) {
    Injectable()(target);

    const existing: BillingProviderRegistration[] =
      Reflect.getMetadata(BILLING_PROVIDER_METADATA, PaymentProvider) || [];

    if (existing.some((r) => r.provider === params.provider)) {
      throw new Error(`Duplicate billing provider '${params.provider}'`);
    }

    existing.push({ target, provider: params.provider });

    Reflect.defineMetadata(
      BILLING_PROVIDER_METADATA,
      existing,
      PaymentProvider,
    );
  };
}
