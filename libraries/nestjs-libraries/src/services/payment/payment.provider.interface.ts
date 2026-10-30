// payment/interfaces/payment-provider.interface.ts

export interface CreatePaymentInput {
  paymentId: string;
  amount: number; // smallest currency unit, e.g. paise
  currency: string;
  description: string;
  customerEmail: string;
  returnUrl: string;
}

export interface CreatePaymentOutput {
  providerPaymentId: string;
  checkoutUrl?: string;
  clientSecret?: string;
}

export interface VerifyPaymentInput {
  providerPaymentId: string;
}

export interface VerifyPaymentOutput {
  providerPaymentId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
}

export interface PaymentProvider {
  readonly name: string;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput>;

  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentOutput>;

  verifyWebhook(payload: Buffer, signature: string): boolean;
}
