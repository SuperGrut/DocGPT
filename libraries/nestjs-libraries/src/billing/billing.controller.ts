import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard"; // match your auth setup
import { CurrentUserId } from "../auth/current-user.decorator"; // match your auth setup
import { BillingEnabledGuard } from "./billing.guard";
import { ChangePlanDto, CheckoutDto, PlansQueryDto } from "./billing.dto";
import { BillingService } from "./billing.service";

@Controller("billing")
@UseGuards(BillingEnabledGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public, so a pricing page can call it before login. */
  @Get("plans")
  plans(@Query() q: PlansQueryDto) {
    return this.billing.listPlans(q.country);
  }

  @Get("subscription")
  @UseGuards(AuthGuard)
  overview(@CurrentUserId() userId: string) {
    return this.billing.getOverview(userId);
  }

  @Post("checkout")
  @UseGuards(AuthGuard)
  checkout(@CurrentUserId() userId: string, @Body() dto: CheckoutDto) {
    return this.billing.createCheckout(userId, dto);
  }

  @Post("subscription/cancel")
  @UseGuards(AuthGuard)
  cancel(@CurrentUserId() userId: string) {
    return this.billing.cancel(userId);
  }

  @Post("subscription/resume")
  @UseGuards(AuthGuard)
  resume(@CurrentUserId() userId: string) {
    return this.billing.resume(userId);
  }

  @Post("subscription/change-plan")
  @UseGuards(AuthGuard)
  changePlan(@CurrentUserId() userId: string, @Body() dto: ChangePlanDto) {
    return this.billing.changePlan(userId, dto);
  }

  @Post("portal")
  @UseGuards(AuthGuard)
  portal(@CurrentUserId() userId: string) {
    return this.billing.createPortalSession(userId);
  }
}
