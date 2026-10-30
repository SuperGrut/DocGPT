// src/payment/providers/stripe/stripe.provider.ts

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

import {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentOutput,
  VerifyPaymentInput,
  VerifyPaymentOutput,
} from "../../interfaces/payment-provider.interface";

@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = "STRIPE";

  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.stripe = new Stripe(
      this.config.getOrThrow<string>("STRIPE_SECRET_KEY"),
    );

    this.webhookSecret = this.config.getOrThrow<string>(
      "STRIPE_WEBHOOK_SECRET",
    );
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amount,
            product_data: {
              name: input.description,
            },
          },
          quantity: 1,
        },
      ],

      customer_email: input.customerEmail,

      success_url: `${input.returnUrl}?payment=success`,
      cancel_url: `${input.returnUrl}?payment=cancelled`,

      metadata: {
        paymentId: input.paymentId,
      },
    });

    if (!session.url) {
      throw new Error("Stripe checkout URL was not returned");
    }

    return {
      providerPaymentId: session.id,
      checkoutUrl: session.url,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentOutput> {
    const session = await this.stripe.checkout.sessions.retrieve(
      input.providerPaymentId,
    );

    let status: VerifyPaymentOutput["status"] = "PENDING";

    if (session.payment_status === "paid") {
      status = "SUCCEEDED";
    } else if (session.status === "expired") {
      status = "FAILED";
    }

    return {
      providerPaymentId: session.id,
      status,
    };
  }

  verifyWebhook(payload: Buffer, signature: string): boolean {
    try {
      this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret,
      );

      return true;
    } catch {
      return false;
    }
  }
}
