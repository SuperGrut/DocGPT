import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentProviderName } from "@prisma/client";
import Stripe from "stripe";

import {
  PaymentProvider,
  CreateProviderSubscriptionInput,
  ProviderSubscriptionResult,
  NormalizedWebhookEvent,
} from "../interfaces/payment-provider.interface";

@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly name = PaymentProviderName.STRIPE;

  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>("STRIPE_SECRET_KEY");
    const webhookSecret = this.config.get<string>("STRIPE_WEBHOOK_SECRET");

    if (!secretKey || !webhookSecret) {
      throw new Error("Stripe configuration is missing");
    }

    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  async createSubscription(
    input: CreateProviderSubscriptionInput,
  ): Promise<ProviderSubscriptionResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: input.email,
      line_items: [
        {
          price: input.externalPlanId,
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.userId,
      metadata: {
        userId: input.userId,
        planCode: input.planCode,
      },
      subscription_data: {
        metadata: {
          userId: input.userId,
          planCode: input.planCode,
        },
      },
    });

    if (!session.url || !session.subscription) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return {
      externalSubscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id,
      checkoutUrl: session.url,
    };
  }

  async verifyWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<NormalizedWebhookEvent> {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );

    const object = event.data.object as any;

    return {
      eventId: event.id,
      type: event.type,
      externalSubscriptionId:
        typeof object.subscription === "string"
          ? object.subscription
          : (object.subscription?.id ??
            (object.object === "subscription" ? object.id : undefined)),
      externalPaymentId: object.payment_intent ?? object.id,
      amount: object.amount_paid ?? object.amount,
      currency: object.currency?.toUpperCase(),
      status: object.status,
      occurredAt: new Date(event.created * 1000),
    };
  }
}
