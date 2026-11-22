import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Subscription, SubscriptionStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service"; // match your other repositories

export interface SubscriptionUpsert {
  userId: string;
  provider: string;
  providerSubscriptionId: string;
  planKey: string;
  interval: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
}

@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- users and documents ----

  findUserBasics(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
  }

  async userExists(userId: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { id: userId } })) > 0;
  }

  countDocuments(userId: string) {
    return this.prisma.document.count({ where: { userId } });
  }

  // ---- subscriptions ----

  listSubscriptions(userId: string): Promise<Subscription[]> {
    return this.prisma.subscription.findMany({ where: { userId } });
  }

  upsertSubscription(d: SubscriptionUpsert) {
    return this.prisma.subscription.upsert({
      where: {
        provider_providerSubscriptionId: {
          provider: d.provider,
          providerSubscriptionId: d.providerSubscriptionId,
        },
      },
      create: {
        userId: d.userId,
        provider: d.provider,
        providerSubscriptionId: d.providerSubscriptionId,
        planKey: d.planKey,
        interval: d.interval,
        status: d.status,
        currentPeriodEnd: d.currentPeriodEnd,
        cancelAtPeriodEnd: d.cancelAtPeriodEnd ?? false,
      },
      update: {
        planKey: d.planKey,
        interval: d.interval,
        status: d.status,
        // Never wipe a known value because a provider response omitted it.
        ...(d.currentPeriodEnd ? { currentPeriodEnd: d.currentPeriodEnd } : {}),
        ...(d.cancelAtPeriodEnd === null
          ? {}
          : { cancelAtPeriodEnd: d.cancelAtPeriodEnd }),
      },
    });
  }

  setCancelAtPeriodEnd(id: string, value: boolean) {
    return this.prisma.subscription.update({
      where: { id },
      data: { cancelAtPeriodEnd: value },
    });
  }

  /** Oldest-synced first, so repeated runs rotate through everything. */
  listReconcilable(limit: number): Promise<Subscription[]> {
    return this.prisma.subscription.findMany({
      where: { status: { in: ["INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED"] } },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }

  // ---- customers ----

  async findCustomerId(
    userId: string,
    provider: string,
  ): Promise<string | null> {
    const row = await this.prisma.billingCustomer.findUnique({
      where: { userId_provider: { userId, provider } },
      select: { providerCustomerId: true },
    });
    return row?.providerCustomerId ?? null;
  }

  async findUserIdByCustomer(
    provider: string,
    providerCustomerId: string,
  ): Promise<string | null> {
    const row = await this.prisma.billingCustomer.findUnique({
      where: { provider_providerCustomerId: { provider, providerCustomerId } },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  upsertCustomer(userId: string, provider: string, providerCustomerId: string) {
    return this.prisma.billingCustomer.upsert({
      where: { userId_provider: { userId, provider } },
      create: { userId, provider, providerCustomerId },
      update: { providerCustomerId },
    });
  }

  // ---- webhook events ----

  /** True if this delivery should be processed (new, or an earlier attempt didn't finish). */
  async claimWebhookEvent(
    provider: string,
    eventId: string,
    type: string,
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { provider, eventId, type },
      });
      return true;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        const existing = await this.prisma.webhookEvent.findUnique({
          where: { provider_eventId: { provider, eventId } },
        });
        return !existing?.processedAt;
      }
      throw e;
    }
  }

  async finishWebhookEvent(
    provider: string,
    eventId: string,
    o: { processed: boolean; error?: string },
  ) {
    await this.prisma.webhookEvent.update({
      where: { provider_eventId: { provider, eventId } },
      data: {
        processedAt: o.processed ? new Date() : null,
        error: o.error ?? null,
      },
    });
  }

  // ---- usage counters ----

  /** Atomic: increments only while below the limit, so concurrent requests can't overshoot. */
  async tryConsumeUsage(
    userId: string,
    metric: string,
    period: string,
    limit: number,
  ): Promise<boolean> {
    if (limit <= 0) return false;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "UsageCounter" ("userId", "metric", "period", "count")
      VALUES (${userId}, ${metric}, ${period}, 1)
      ON CONFLICT ("userId", "metric", "period")
      DO UPDATE SET "count" = "UsageCounter"."count" + 1
      WHERE "UsageCounter"."count" < ${limit}
      RETURNING "count"`;
    return rows.length > 0;
  }

  async refundUsage(
    userId: string,
    metric: string,
    period: string,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "UsageCounter" SET "count" = GREATEST("count" - 1, 0)
      WHERE "userId" = ${userId} AND "metric" = ${metric} AND "period" = ${period}`;
  }

  async getUsage(
    userId: string,
    metric: string,
    period: string,
  ): Promise<number> {
    const row = await this.prisma.usageCounter.findUnique({
      where: { userId_metric_period: { userId, metric, period } },
      select: { count: true },
    });
    return row?.count ?? 0;
  }
}
