import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { IsEnum, IsString, IsUrl } from "class-validator";
import { PaymentProviderName } from "@prisma/client";

import { PlanService } from "./plan.service";
import { PaymentService } from "./payment.service";
import { BillingService } from "./billing.service";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

class CreateSubscriptionDto {
  @IsString()
  planCode: string;

  @IsEnum(PaymentProviderName)
  provider: PaymentProviderName;

  @IsUrl({ require_tld: false })
  successUrl: string;

  @IsUrl({ require_tld: false })
  cancelUrl: string;
}

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly plans: PlanService,
    private readonly payments: PaymentService,
    private readonly billing: BillingService,
  ) {}

  @Get("plans")
  getPlans() {
    return this.plans.listPlans();
  }

  @Get("me")
  getMyBilling(@CurrentUser() user: any) {
    return this.billing.getUserBilling(user.id);
  }

  @Post("subscriptions")
  createSubscription(
    @CurrentUser() user: any,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.payments.createSubscription({
      userId: user.id,
      email: user.email,
      ...dto,
    });
  }
}
