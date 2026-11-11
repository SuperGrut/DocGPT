import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentProviderName } from "@prisma/client";
import Razorpay from "razorpay";
import * as crypto from "crypto";

import {
  PaymentProvider,
  CreateProviderSubscriptionInput,
  ProviderSubscriptionResult,
  NormalizedWebhookEvent,
} from "../interfaces/payment-provider.interface";

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly name = PaymentProviderName.RAZORPAY;

  private readonly client: Razorpay;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>("RAZORPAY_KEY_ID");
    const keySecret = this.config.get<string>("RAZORPAY_KEY_SECRET");

    this.webhookSecret =
      this.config.get<string>("RAZORPAY_WEBHOOK_SECRET") ?? "";

    if (!keyId || !keySecret || !this.webhookSecret) {
      throw new Error("Razorpay configuration is missing");
    }

    this.client = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  async createSubscription(
    input: CreateProviderSubscriptionInput,
  ): Promise<ProviderSubscriptionResult> {
    const subscription = await this.client.subscriptions.create({
      plan_id: input.externalPlanId,
      total_count: input.interval === "YEAR" ? 10 : 120,
      quantity: 1,
      customer_notify: true,
      notes: {
        userId: input.userId,
        planCode: input.planCode,
      },
    });

    return {
      externalSubscriptionId: subscription.id,
      checkoutOptions: {
        key: this.config.get<string>("RAZORPAY_KEY_ID"),
        subscription_id: subscription.id,
        name: "Your Application",
        description: input.planCode,
        prefill: {
          email: input.email,
        },
      },
    };
  }

  async verifyWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<NormalizedWebhookEvent> {
    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");

    const actualBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new Error("Invalid Razorpay webhook signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));

    const subscriptionEntity = payload.payload?.subscription?.entity;

    const paymentEntity = payload.payload?.payment?.entity;

    return {
      eventId: payload.id,
      type: payload.event,
      externalSubscriptionId:
        subscriptionEntity?.id ?? paymentEntity?.subscription_id,
      externalPaymentId: paymentEntity?.id,
      status: subscriptionEntity?.status,
      amount: paymentEntity?.amount,
      currency: paymentEntity?.currency,
      occurredAt: payload.created_at
        ? new Date(payload.created_at * 1000)
        : undefined,
    };
  }
}
