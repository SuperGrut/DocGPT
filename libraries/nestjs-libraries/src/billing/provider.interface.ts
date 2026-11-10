import { PaymentProviderName } from "@prisma/client";

export interface CreateProviderSubscriptionInput {
  userId: string;
  email: string;
  planCode: string;
  amount: number;
  currency: string;
  interval: "MONTH" | "YEAR";
  intervalCount: number;
  externalPlanId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface ProviderSubscriptionResult {
  externalSubscriptionId: string;
  checkoutUrl?: string;
  checkoutOptions?: Record<string, unknown>;
}

export interface NormalizedWebhookEvent {
  eventId: string;
  type: string;
  externalSubscriptionId?: string;
  externalPaymentId?: string;
  status?: string;
  amount?: number;
  currency?: string;
  occurredAt?: Date;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;

  //create order
  createSubscription(
    input: CreateProviderSubscriptionInput,
  ): Promise<ProviderSubscriptionResult>;

  //verify order
  verifyWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<NormalizedWebhookEvent>;
}
