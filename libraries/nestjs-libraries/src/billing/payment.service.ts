import { Injectable, BadRequestException } from "@nestjs/common";

import { PaymentProviderName, SubscriptionStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { PlanService } from "./plan.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
    private readonly providers: PaymentProviderRegistry,
  ) {}

  async createSubscription(input: {
    userId: string;
    email: string;
    planCode: string;
    provider: PaymentProviderName;
    successUrl: string;
    cancelUrl: string;
  }) {
    const plan = await this.plans.getPlan(input.planCode);

    const providerPlan = plan.providerPlans.find(
      (item) => item.provider === input.provider,
    );

    if (!providerPlan) {
      throw new BadRequestException(
        "This plan is not configured for the selected provider",
      );
    }

    const existing = await this.prisma.subscription.findFirst({
      where: {
        userId: input.userId,
        status: {
          in: [
            SubscriptionStatus.PENDING,
            SubscriptionStatus.INCOMPLETE,
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
          ],
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        "You already have a subscription that needs attention or is active",
      );
    }

    // Create local record before calling the provider.
    const localSubscription = await this.prisma.subscription.create({
      data: {
        userId: input.userId,
        planId: plan.id,
        provider: input.provider,
        externalSubscriptionId: `pending_${crypto.randomUUID()}`,
        status: SubscriptionStatus.PENDING,
      },
    });

    try {
      const provider = this.providers.get(input.provider);

      const result = await provider.createSubscription({
        userId: input.userId,
        email: input.email,
        planCode: plan.code,
        amount: plan.amount,
        currency: plan.currency,
        interval: plan.interval,
        intervalCount: plan.intervalCount,
        externalPlanId: providerPlan.externalPlanId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      });

      await this.prisma.subscription.update({
        where: { id: localSubscription.id },
        data: {
          externalSubscriptionId: result.externalSubscriptionId,
        },
      });

      return {
        subscriptionId: localSubscription.id,
        provider: input.provider,
        ...result,
      };
    } catch (error) {
      await this.prisma.subscription.update({
        where: { id: localSubscription.id },
        data: {
          status: SubscriptionStatus.INCOMPLETE,
        },
      });

      throw error;
    }
  }
}
