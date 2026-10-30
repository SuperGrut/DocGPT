// payment/payment-provider.registry.ts

import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "./interfaces/payment-provider.interface";

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    razorpayProvider: RazorpayProvider,
    stripeProvider: StripeProvider,
    cashfreeProvider: CashfreeProvider,
  ) {
    this.register(razorpayProvider);
    this.register(stripeProvider);
    this.register(cashfreeProvider);
  }

  register(provider: PaymentProvider) {
    this.providers.set(provider.name, provider);
  }

  get(name: string): PaymentProvider {
    const provider = this.providers.get(name);

    if (!provider) {
      throw new Error(`Payment provider "${name}" is not registered`);
    }

    return provider;
  }
}
