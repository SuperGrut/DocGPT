// src/payment/providers/razorpay/razorpay.provider.ts

import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Razorpay from "razorpay";
import {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentOutput,
  VerifyPaymentInput,
  VerifyPaymentOutput,
} from "../../interfaces/payment-provider.interface";

import {
  validatePaymentVerification,
  validateWebhookSignature,
} from "razorpay/dist/utils/razorpay-utils";

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly name = "RAZORPAY";

  private readonly razorpay: Razorpay;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.keySecret = this.config.getOrThrow<string>("RAZORPAY_KEY_SECRET");

    this.webhookSecret = this.config.getOrThrow<string>(
      "RAZORPAY_WEBHOOK_SECRET",
    );

    this.razorpay = new Razorpay({
      key_id: this.config.getOrThrow<string>("RAZORPAY_KEY_ID"),
      key_secret: this.keySecret,
    });
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentOutput> {
    const order = await this.razorpay.orders.create({
      amount: input.amount,
      currency: input.currency,
      receipt: input.paymentId,
      notes: {
        paymentId: input.paymentId,
      },
    });

    return {
      providerPaymentId: order.id,
    };
  }

  async verifyPayment(
    input: VerifyPaymentInput & {
      orderId: string;
      paymentId: string;
      signature: string;
    },
  ): Promise<VerifyPaymentOutput> {
    try {
      validatePaymentVerification(
        {
          order_id: input.orderId,
          payment_id: input.paymentId,
        },
        input.signature,
        this.keySecret,
      );

      return {
        providerPaymentId: input.paymentId,
        status: "SUCCEEDED",
      };
    } catch {
      return {
        providerPaymentId: input.paymentId,
        status: "FAILED",
      };
    }
  }

  verifyWebhook(payload: Buffer, signature: string): boolean {
    try {
      validateWebhookSignature(
        payload.toString("utf8"),
        signature,
        this.webhookSecret,
      );

      return true;
    } catch {
      return false;
    }
  }
}
