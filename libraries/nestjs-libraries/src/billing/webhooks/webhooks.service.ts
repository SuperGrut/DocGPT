import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { BillingRepository } from "../billing.repository";
import {
  NormalizedEvent,
  WebhookHeaders,
} from "../providers/payment-provider.interface";
import { PaymentProviderManager } from "../providers/payment-provider.manager";
import { SubscriptionSyncService } from "./subscription-sync.service";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly providers: PaymentProviderManager,
    private readonly repo: BillingRepository,
    private readonly sync: SubscriptionSyncService,
  ) {}

  async handle(
    providerName: string,
    raw: Buffer,
    headers: WebhookHeaders,
  ): Promise<void> {
    const provider = this.providers.tryGet(providerName);
    if (!provider) throw new NotFoundException();

    let event: NormalizedEvent;
    try {
      event = provider.parseWebhook(raw, headers);
    } catch (e) {
      this.logger.warn(
        `Rejected ${providerName} webhook: ${(e as Error).message}`,
      );
      throw new BadRequestException("Invalid webhook");
    }

    if (
      !(await this.repo.claimWebhookEvent(
        providerName,
        event.eventId,
        event.type,
      ))
    )
      return; // already handled

    try {
      let error: string | undefined;
      if (event.providerSubscriptionId) {
        const result = await this.sync.sync(
          providerName,
          event.providerSubscriptionId,
        );
        if (!result.ok) {
          // Retrying can't fix a configuration problem, so record it and acknowledge the event.
          error = result.reason;
          this.logger.error(
            `${providerName} event ${event.eventId} (${event.type}): ${error}`,
          );
        }
      }
      await this.repo.finishWebhookEvent(providerName, event.eventId, {
        processed: true,
        error,
      });
    } catch (e) {
      await this.repo
        .finishWebhookEvent(providerName, event.eventId, {
          processed: false,
          error: (e as Error).message,
        })
        .catch(() => undefined);
      throw e; // a 500 makes the provider retry later
    }
  }
}
