import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Subscription } from "@prisma/client";

import { BillingRepository } from "../billing.repository";
import {
  NO_LIMIT,
  PLANS,
  PlanDef,
  PlanKey,
  UNLIMITED_PLAN,
  isPlanKey,
} from "../plans/plans.catalog";
import { PlanLimitError } from "./entitlements.errors";

const METRIC_MESSAGES = "messages";
const monthPeriod = (d = new Date()) => d.toISOString().slice(0, 7); // calendar month, UTC

@Injectable()
export class EntitlementsService {
  constructor(
    private readonly repo: BillingRepository,
    private readonly config: ConfigService,
  ) {}

  /** BILLING_ENABLED=true. When it's off (self-hosted), nothing is limited and nothing touches the DB. */
  get enabled(): boolean {
    return this.config.get<string>("BILLING_ENABLED") === "true";
  }

  private get graceMs(): number {
    return Number(this.config.get("BILLING_GRACE_DAYS") ?? 3) * 86_400_000;
  }

  isEntitled(sub: Subscription, now = new Date()): boolean {
    const end = sub.currentPeriodEnd?.getTime();
    switch (sub.status) {
      case "ACTIVE":
        return true;
      case "PAST_DUE": // a failed renewal keeps access for a few days while the provider retries
        return end !== undefined && now.getTime() < end + this.graceMs;
      case "CANCELED": // cancelled, but the paid period isn't over
        return end !== undefined && now.getTime() < end;
      default:
        return false;
    }
  }

  async entitledSubscriptions(userId: string): Promise<Subscription[]> {
    const now = new Date();
    return (await this.repo.listSubscriptions(userId)).filter(
      (s) => isPlanKey(s.planKey) && this.isEntitled(s, now),
    );
  }

  async getPlan(
    userId: string,
  ): Promise<{ plan: PlanDef; subscription: Subscription | null }> {
    if (!this.enabled) return { plan: UNLIMITED_PLAN, subscription: null };

    const best = (await this.entitledSubscriptions(userId)).sort(
      (a, b) =>
        PLANS[b.planKey as PlanKey].rank - PLANS[a.planKey as PlanKey].rank,
    )[0];
    return best
      ? { plan: PLANS[best.planKey as PlanKey], subscription: best }
      : { plan: PLANS.free, subscription: null };
  }

  async assertCanUploadDocument(
    userId: string,
    sizeBytes: number,
  ): Promise<void> {
    if (!this.enabled) return;
    const { plan } = await this.getPlan(userId);

    if (sizeBytes > plan.limits.maxFileBytes) {
      const mb = Math.floor(plan.limits.maxFileBytes / (1024 * 1024));
      throw new PlanLimitError(
        "FILE_TOO_LARGE",
        `Your plan allows files up to ${mb} MB`,
      );
    }
    if ((await this.repo.countDocuments(userId)) >= plan.limits.maxDocuments) {
      throw new PlanLimitError(
        "DOCUMENT_LIMIT",
        `Your plan allows up to ${plan.limits.maxDocuments} documents`,
      );
    }
  }

  async maxPagesPerDocument(userId: string): Promise<number> {
    return (await this.getPlan(userId)).plan.limits.maxPagesPerDocument;
  }

  /** Takes one message from the monthly quota, or throws a 402. */
  async consumeMessage(userId: string): Promise<void> {
    if (!this.enabled) return;
    const { plan } = await this.getPlan(userId);
    if (plan.limits.messagesPerMonth >= NO_LIMIT) return;

    const ok = await this.repo.tryConsumeUsage(
      userId,
      METRIC_MESSAGES,
      monthPeriod(),
      plan.limits.messagesPerMonth,
    );
    if (!ok) {
      throw new PlanLimitError(
        "MESSAGE_LIMIT",
        `You've used all ${plan.limits.messagesPerMonth} messages for this month`,
      );
    }
  }

  /** Gives a message back when an answer produced nothing. */
  async refundMessage(userId: string): Promise<void> {
    if (!this.enabled) return;
    await this.repo.refundUsage(userId, METRIC_MESSAGES, monthPeriod());
  }

  async usage(userId: string) {
    const { plan } = await this.getPlan(userId);
    const now = new Date();
    const limit = (n: number) => (n >= NO_LIMIT ? null : n);
    return {
      messages: {
        used: this.enabled
          ? await this.repo.getUsage(userId, METRIC_MESSAGES, monthPeriod(now))
          : 0,
        limit: limit(plan.limits.messagesPerMonth),
        resetsAt: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        ),
      },
      documents: {
        used: await this.repo.countDocuments(userId),
        limit: limit(plan.limits.maxDocuments),
      },
    };
  }
}
