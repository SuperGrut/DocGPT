import { Injectable, NotFoundException } from "@nestjs/common";

import {
  PaymentProviderName,
  SubscriptionStatus,
  PaymentStatus,
} from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { NormalizedWebhookEvent } from "./interfaces/payment-provider.interface";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserBilling(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: {
          in: [
            SubscriptionStatus.TRIALING,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.PAUSED,
          ],
        },
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  async hasActiveSubscription(userId: string): Promise<boolean> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    return !!subscription;
  }

  async processWebhook(
    provider: PaymentProviderName,
    event: NormalizedWebhookEvent,
  ) {
    // Claim the event once. Duplicate webhook deliveries are normal.
    try {
      await this.prisma.webhookEvent.create({
        data: {
          provider,
          externalEventId: event.eventId,
          eventType: event.type,
        },
      });
    } catch (error) {
      // A unique constraint violation means this event was already received.
      const existing = await this.prisma.webhookEvent.findUnique({
        where: {
          provider_externalEventId: {
            provider,
            externalEventId: event.eventId,
          },
        },
      });

      if (existing?.processedAt) {
        return;
      }

      if (!existing) {
        throw error;
      }
    }

    try {
      await this.applyProviderEvent(provider, event);

      await this.prisma.webhookEvent.update({
        where: {
          provider_externalEventId: {
            provider,
            externalEventId: event.eventId,
          },
        },
        data: {
          processedAt: new Date(),
        },
      });
    } catch (error) {
      // Leave processedAt null so a retry/reconciliation job can retry.
      throw error;
    }
  }

  private async applyProviderEvent(
    provider: PaymentProviderName,
    event: NormalizedWebhookEvent,
  ) {
    if (!event.externalSubscriptionId) {
      return;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        provider,
        externalSubscriptionId: event.externalSubscriptionId,
      },
    });

    if (!subscription) {
      // Do not grant access based on an unknown subscription.
      return;
    }

    const status = this.mapStatus(provider, event);

    await this.prisma.$transaction(async (tx) => {
      if (status) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status,
            ...(status === SubscriptionStatus.CANCELLED
              ? { cancelledAt: new Date() }
              : {}),
          },
        });
      }

      if (event.externalPaymentId && event.amount != null) {
        await tx.payment.upsert({
          where: {
            provider_externalPaymentId: {
              provider,
              externalPaymentId: event.externalPaymentId,
            },
          },
          create: {
            userId: subscription.userId,
            subscriptionId: subscription.id,
            provider,
            externalPaymentId: event.externalPaymentId,
            amount: event.amount,
            currency: event.currency ?? "INR",
            status: this.isSuccessfulPayment(event.type)
              ? PaymentStatus.SUCCEEDED
              : PaymentStatus.FAILED,
            paidAt: this.isSuccessfulPayment(event.type)
              ? (event.occurredAt ?? new Date())
              : null,
          },
          update: {
            status: this.isSuccessfulPayment(event.type)
              ? PaymentStatus.SUCCEEDED
              : PaymentStatus.FAILED,
            paidAt: this.isSuccessfulPayment(event.type)
              ? (event.occurredAt ?? new Date())
              : null,
          },
        });
      }
    });
  }

  private isSuccessfulPayment(eventType: string): boolean {
    return [
      "invoice.paid",
      "payment.captured",
      "subscription.charged",
    ].includes(eventType);
  }

  private mapStatus(
    provider: PaymentProviderName,
    event: NormalizedWebhookEvent,
  ): SubscriptionStatus | undefined {
    if (provider === PaymentProviderName.STRIPE) {
      switch (event.type) {
        case "customer.subscription.created":
          return SubscriptionStatus.INCOMPLETE;
        case "customer.subscription.updated":
          return this.mapStripeStatus(event.status);
        case "customer.subscription.deleted":
          return SubscriptionStatus.CANCELLED;
        case "invoice.payment_failed":
          return SubscriptionStatus.PAST_DUE;
        default:
          return undefined;
      }
    }

    switch (event.type) {
      case "subscription.authenticated":
        return SubscriptionStatus.INCOMPLETE;
      case "subscription.activated":
        return SubscriptionStatus.ACTIVE;
      case "subscription.halted":
        return SubscriptionStatus.PAST_DUE;
      case "subscription.paused":
        return SubscriptionStatus.PAUSED;
      case "subscription.resumed":
        return SubscriptionStatus.ACTIVE;
      case "subscription.cancelled":
        return SubscriptionStatus.CANCELLED;
      case "subscription.completed":
        return SubscriptionStatus.EXPIRED;
      default:
        return undefined;
    }
  }

  private mapStripeStatus(status?: string): SubscriptionStatus | undefined {
    const map: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      trialing: SubscriptionStatus.TRIALING,
      past_due: SubscriptionStatus.PAST_DUE,
      unpaid: SubscriptionStatus.UNPAID,
      canceled: SubscriptionStatus.CANCELLED,
      incomplete: SubscriptionStatus.INCOMPLETE,
      paused: SubscriptionStatus.PAUSED,
    };

    return status ? map[status] : undefined;
  }
}
