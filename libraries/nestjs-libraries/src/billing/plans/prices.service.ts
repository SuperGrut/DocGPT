import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  INTERVALS,
  Interval,
  PAID_PLAN_KEYS,
  PaidPlanKey,
} from "./plans.catalog";

/**
 * Provider price ids come from env: {PROVIDER}_PRICE_{PLAN}_{INTERVAL}, for example
 * STRIPE_PRICE_PRO_MONTH (price id), RAZORPAY_PRICE_PRO_MONTH (plan id), DODO_PRICE_PRO_MONTH (product id).
 */
@Injectable()
export class PricesService {
  constructor(private readonly config: ConfigService) {}

  providerPriceId(
    provider: string,
    plan: PaidPlanKey,
    interval: Interval,
  ): string | null {
    const key = `${provider.toUpperCase()}_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;
    return this.config.get<string>(key) || null;
  }

  /** Reverse lookup, used when syncing: which plan and interval does this provider price id mean? */
  lookup(
    provider: string,
    providerPriceId: string | null,
  ): { planKey: PaidPlanKey; interval: Interval } | null {
    if (!providerPriceId) return null;
    for (const planKey of PAID_PLAN_KEYS) {
      for (const interval of INTERVALS) {
        if (
          this.providerPriceId(provider, planKey, interval) === providerPriceId
        ) {
          return { planKey, interval };
        }
      }
    }
    return null;
  }
}
