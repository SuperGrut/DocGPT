import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  BadRequestException,
} from "@nestjs/common";
import { Request } from "express";
import { PaymentProviderName } from "@prisma/client";

import { PaymentProviderRegistry } from "./payment-provider.registry";
import { BillingService } from "./billing.service";

@Controller("webhooks")
export class WebhookController {
  constructor(
    private readonly providers: PaymentProviderRegistry,
    private readonly billing: BillingService,
  ) {}

  @Post("razorpay")
  @HttpCode(HttpStatus.OK)
  async razorpay(
    @Req() req: Request,
    @Headers("x-razorpay-signature") signature: string,
  ) {
    return this.handle(PaymentProviderName.RAZORPAY, req, signature);
  }

  @Post("stripe")
  @HttpCode(HttpStatus.OK)
  async stripe(
    @Req() req: Request,
    @Headers("stripe-signature") signature: string,
  ) {
    return this.handle(PaymentProviderName.STRIPE, req, signature);
  }

  private async handle(
    providerName: PaymentProviderName,
    req: Request,
    signature: string,
  ) {
    if (!Buffer.isBuffer(req.body) || !signature) {
      throw new BadRequestException("Raw webhook body or signature is missing");
    }

    const provider = this.providers.get(providerName);

    const event = await provider.verifyWebhook(req.body, signature);

    await this.billing.processWebhook(providerName, event);

    return { received: true };
  }
}
