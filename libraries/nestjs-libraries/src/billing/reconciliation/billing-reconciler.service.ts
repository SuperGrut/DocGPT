import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BillingRepository } from "../billing.repository";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { SubscriptionSyncService } from "../webhooks/subscription-sync.service";

/**
 * Safety net for missed webhooks (a deploy, an outage, a bad secret): re-sync subscriptions that
 * look live, oldest first. Call reconcileAll() from your existing scheduler (a nightly Temporal
 * schedule or a cron), the same way you run the storage reconciliation job.
 */
@Injectable()
export class BillingReconciler {
  private readonly logger = new Logger(BillingReconciler.name);

  constructor(
    private readonly repo: BillingRepository,
    private readonly sync: SubscriptionSyncService,
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService,
  ) {}

  async reconcileAll(): Promise<{ checked: number; failed: number }> {
    if (!this.entitlements.enabled) return { checked: 0, failed: 0 };

    const batch = Number(this.config.get("BILLING_RECONCILE_BATCH") ?? 500);
    const subs = await this.repo.listReconcilable(batch);

    let failed = 0;
    for (const sub of subs) {
      try {
        const result = await this.sync.sync(
          sub.provider,
          sub.providerSubscriptionId,
        );
        if (!result.ok) {
          failed++;
          this.logger.warn(result.reason);
        }
      } catch (e) {
        failed++;
        this.logger.warn(
          `Reconcile failed for ${sub.provider} ${sub.providerSubscriptionId}: ${(e as Error).message}`,
        );
      }
    }
    return { checked: subs.length, failed };
  }
}
