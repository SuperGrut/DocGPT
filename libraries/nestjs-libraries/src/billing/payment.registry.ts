import { Injectable } from "@nestjs/common";
import { PaymentProviderName } from "@prisma/client";

import { PaymentProvider } from "./interfaces/payment-provider.interface";
import { RazorpayProvider } from "./providers/razorpay.provider";
import { StripeProvider } from "./providers/stripe.provider";

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers: Map<PaymentProviderName, PaymentProvider>;

  constructor(razorpay: RazorpayProvider, stripe: StripeProvider) {
    this.providers = new Map([
      [PaymentProviderName.RAZORPAY, razorpay],
      [PaymentProviderName.STRIPE, stripe],
    ]);
  }

  get(provider: PaymentProviderName): PaymentProvider {
    const implementation = this.providers.get(provider);

    if (!implementation) {
      throw new Error(`Unsupported payment provider: ${provider}`);
    }

    return implementation;
  }
}
