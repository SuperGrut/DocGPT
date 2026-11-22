import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Subscription } from "@prisma/client";

import { ChangePlanDto, CheckoutDto } from "./billing.dto";
import { BillingRepository } from "./billing.repository";
import { EntitlementsService } from "./entitlements/entitlements.service";
import {
  INTERVALS,
  PLANS,
  PaidPlanKey,
  publicLimits,
} from "./plans/plans.catalog";
import { PricesService } from "./plans/prices.service";
import { ProviderRouter } from "./routing/provider-router";
import {
  ProviderError,
  UnsupportedOperationError,
} from "./providers/payment-provider.interface";
import { PaymentProviderManager } from "./providers/payment-provider.manager";
import { SubscriptionSyncService } from "./webhooks/subscription-sync.service";

@Injectable()
export class BillingService implements OnModuleInit {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly repo: BillingRepository,
    private readonly entitlements: EntitlementsService,
    private readonly providers: PaymentProviderManager,
    private readonly router: ProviderRouter,
    private readonly prices: PricesService,
    private readonly sync: SubscriptionSyncService,
    private readonly config: ConfigService,
  ) {}

  // Fail at boot, not on the first checkout.
  onModuleInit() {
    if (!this.entitlements.enabled) return;
    const enabled = this.providers.enabledNames();
    if (!enabled.length)
      throw new Error("BILLING_ENABLED=true but BILLING_PROVIDERS is empty");
    for (const name of enabled) this.providers.get(name).validate();
    this.router.validate(enabled);
    void this.config.getOrThrow<string>("APP_URL");
  }

  // ---- read ----

  listPlans(country?: string) {
    const provider = this.router.providerFor(country);
    const currency = this.router.currencyFor(provider);
    return Object.values(PLANS).map((plan) => ({
      key: plan.key,
      name: plan.name,
      limits: publicLimits(plan.limits),
      // Only intervals that are actually configured at the provider are offered.
      prices: plan.prices
        ? INTERVALS.filter((i) =>
            this.prices.providerPriceId(provider, plan.key as PaidPlanKey, i),
          ).map((interval) => ({
            interval,
            currency,
            amount: plan.prices![interval][currency],
          }))
        : [],
    }));
  }

  async getOverview(userId: string) {
    const { plan, subscription } = await this.entitlements.getPlan(userId);
    const provider = subscription
      ? this.providers.tryGet(subscription.provider)
      : null;
    return {
      plan: {
        key: plan.key,
        name: plan.name,
        limits: publicLimits(plan.limits),
      },
      subscription: subscription && {
        provider: subscription.provider,
        interval: subscription.interval,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
      capabilities: provider?.capabilities ?? null,
      usage: await this.entitlements.usage(userId),
    };
  }

  // ---- actions ----

  async createCheckout(userId: string, dto: CheckoutDto) {
    const { subscription } = await this.entitlements.getPlan(userId);
    if (subscription) {
      throw new ConflictException(
        "You already have a subscription. Change plan or resume it instead.",
      );
    }

    const providerName = this.router.providerFor(dto.billingCountry);
    const provider = this.providers.get(providerName);
    const providerPriceId = this.prices.providerPriceId(
      providerName,
      dto.planKey,
      dto.interval,
    );
    if (!providerPriceId)
      throw new BadRequestException("This plan isn't available in your region");

    const user = await this.repo.findUserBasics(userId);
    if (!user) throw new NotFoundException("User not found");

    const app = this.config.getOrThrow<string>("APP_URL");
    return this.call(async () =>
      provider.createCheckout({
        userId,
        email: user.email,
        planKey: dto.planKey,
        interval: dto.interval,
        providerPriceId,
        billingCountry: dto.billingCountry,
        providerCustomerId: await this.repo.findCustomerId(
          userId,
          providerName,
        ),
        successUrl: `${app}/settings/billing?checkout=success`,
        cancelUrl: `${app}/settings/billing?checkout=cancelled`,
      }),
    );
  }

  async cancel(userId: string) {
    const sub = await this.currentSubscription(userId);
    if (!sub.cancelAtPeriodEnd) {
      const provider = this.providers.get(sub.provider);
      await this.call(() =>
        provider.scheduleCancellation(sub.providerSubscriptionId),
      );
      // Some providers don't report the flag, so record it ourselves. Syncing then keeps it.
      await this.repo.setCancelAtPeriodEnd(sub.id, true);
      await this.refresh(sub);
    }
    return this.getOverview(userId);
  }

  async resume(userId: string) {
    const sub = await this.currentSubscription(userId);
    const provider = this.providers.get(sub.provider);
    if (!provider.capabilities.resume) {
      throw new BadRequestException(
        "This subscription can't be resumed. Subscribe again after it ends.",
      );
    }
    if (sub.cancelAtPeriodEnd) {
      await this.call(() =>
        provider.unscheduleCancellation(sub.providerSubscriptionId),
      );
      await this.repo.setCancelAtPeriodEnd(sub.id, false);
      await this.refresh(sub);
    }
    return this.getOverview(userId);
  }

  async changePlan(userId: string, dto: ChangePlanDto) {
    const sub = await this.currentSubscription(userId);
    if (sub.planKey === dto.planKey && sub.interval === dto.interval) {
      throw new BadRequestException("You're already on this plan");
    }
    const provider = this.providers.get(sub.provider);
    if (!provider.capabilities.changePlan) {
      throw new BadRequestException(
        "This subscription's plan can't be changed. Cancel and subscribe again.",
      );
    }
    const priceId = this.prices.providerPriceId(
      sub.provider,
      dto.planKey,
      dto.interval,
    );
    if (!priceId)
      throw new BadRequestException(
        "That plan isn't available for your subscription",
      );

    await this.call(() =>
      provider.changePlan(sub.providerSubscriptionId, priceId),
    );
    await this.refresh(sub); // the stored plan changes when the provider says it did
    return this.getOverview(userId);
  }

  async createPortalSession(userId: string) {
    const sub = await this.currentSubscription(userId);
    const provider = this.providers.get(sub.provider);
    if (!provider.capabilities.portal)
      throw new BadRequestException("No billing portal for this subscription");

    const customerId = await this.repo.findCustomerId(userId, sub.provider);
    if (!customerId) throw new NotFoundException("No billing customer found");

    const url = await this.call(() =>
      provider.createPortalSession(
        customerId,
        `${this.config.getOrThrow<string>("APP_URL")}/settings/billing`,
      ),
    );
    return { url };
  }

  /** Called before an account is deleted: stop future charges. Best effort, never blocks deletion. */
  async cancelForAccountDeletion(userId: string): Promise<void> {
    if (!this.entitlements.enabled) return;
    for (const sub of await this.entitlements.entitledSubscriptions(userId)) {
      if (sub.cancelAtPeriodEnd) continue;
      try {
        await this.providers
          .get(sub.provider)
          .scheduleCancellation(sub.providerSubscriptionId);
      } catch (e) {
        this.logger.error(
          `Could not cancel ${sub.provider} ${sub.providerSubscriptionId}: ${(e as Error).message}`,
        );
      }
    }
  }

  // ---- helpers ----

  private async currentSubscription(userId: string): Promise<Subscription> {
    const { subscription } = await this.entitlements.getPlan(userId);
    if (!subscription) throw new NotFoundException("No active subscription");
    return subscription;
  }

  private async refresh(sub: Subscription) {
    await this.sync
      .sync(sub.provider, sub.providerSubscriptionId)
      .catch((e: Error) =>
        this.logger.warn(`Refresh after change failed: ${e.message}`),
      );
  }

  /** Maps provider failures to HTTP errors without leaking provider details. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UnsupportedOperationError)
        throw new BadRequestException(e.message);
      if (e instanceof ProviderError) {
        this.logger.error(e.message);
        if (e.status && e.status >= 400 && e.status < 500) {
          throw new BadRequestException(
            "The payment provider rejected this request",
          );
        }
        throw new BadGatewayException(
          "The payment provider is unavailable. Try again shortly.",
        );
      }
      throw e;
    }
  }
}
