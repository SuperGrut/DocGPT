import { Injectable, Logger } from "@nestjs/common";

import { BillingRepository } from "../billing.repository";
import { isPaidPlanKey } from "../plans/plans.catalog";
import { PricesService } from "../plans/prices.service";
import { PaymentProviderManager } from "../providers/payment-provider.manager";

export type SyncResult =
  { ok: true; subscriptionId: string } | { ok: false; reason: string };

/**
 * The only place a Subscription row is written from provider data. Webhooks only say "something
 * changed": we fetch the current state from the provider, so duplicate and out-of-order events can't
 * leave stale data behind.
 */
@Injectable()
export class SubscriptionSyncService {
  private readonly logger = new Logger(SubscriptionSyncService.name);

  constructor(
    private readonly repo: BillingRepository,
    private readonly providers: PaymentProviderManager,
    private readonly prices: PricesService,
  ) {}

  async sync(
    providerName: string,
    providerSubscriptionId: string,
  ): Promise<SyncResult> {
    const n = await this.providers
      .get(providerName)
      .getSubscription(providerSubscriptionId);

    const userId =
      n.userId ??
      (n.providerCustomerId
        ? await this.repo.findUserIdByCustomer(
            providerName,
            n.providerCustomerId,
          )
        : null);
    if (!userId || !(await this.repo.userExists(userId))) {
      return {
        ok: false,
        reason: `cannot attribute ${providerName} subscription ${n.providerSubscriptionId} to a user`,
      };
    }

    const mapped = this.prices.lookup(providerName, n.providerPriceId);
    const planKey =
      mapped?.planKey ??
      (n.planKey && isPaidPlanKey(n.planKey) ? n.planKey : null);
    const interval = mapped?.interval ?? n.interval;
    if (!planKey || !interval) {
      return {
        ok: false,
        reason: `unknown ${providerName} price '${n.providerPriceId}': check the *_PRICE_* env vars`,
      };
    }

    const sub = await this.repo.upsertSubscription({
      userId,
      provider: providerName,
      providerSubscriptionId: n.providerSubscriptionId,
      planKey,
      interval,
      status: n.status,
      currentPeriodEnd: n.currentPeriodEnd,
      cancelAtPeriodEnd: n.cancelAtPeriodEnd,
    });
    if (n.providerCustomerId)
      await this.repo.upsertCustomer(
        userId,
        providerName,
        n.providerCustomerId,
      );

    this.logger.log(
      `Synced ${providerName} ${n.providerSubscriptionId}: ${planKey}/${interval} ${n.status}`,
    );
    return { ok: true, subscriptionId: sub.id };
  }
}
