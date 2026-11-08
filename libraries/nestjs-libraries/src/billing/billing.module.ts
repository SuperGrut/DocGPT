import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { PrismaModule } from "../prisma/prisma.module";

import { PlanService } from "./plan.service";
import { PaymentService } from "./payment.service";
import { BillingService } from "./billing.service";

import { RazorpayProvider } from "./providers/razorpay.provider";
import { StripeProvider } from "./providers/stripe.provider";

import { PaymentProviderRegistry } from "./payment-provider.registry";

import { BillingController } from "./billing.controller";
import { WebhookController } from "./webhook.controller";

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [BillingController, WebhookController],
  providers: [
    PlanService,
    PaymentService,
    BillingService,
    RazorpayProvider,
    StripeProvider,
    PaymentProviderRegistry,
  ],
  exports: [PlanService, BillingService],
})
export class BillingModule {}
