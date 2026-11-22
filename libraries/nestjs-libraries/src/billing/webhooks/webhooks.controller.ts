import {
  BadRequestException,
  Controller,
  HttpCode,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { BillingEnabledGuard } from "../billing.guard";
import { WebhooksService } from "./webhooks.service";

/** Unauthenticated by design: the provider's signature is the authentication. */
@Controller("webhooks")
@UseGuards(BillingEnabledGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post(":provider")
  @HttpCode(200)
  async receive(
    @Param("provider") provider: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (!req.rawBody) throw new BadRequestException("Missing body");
    await this.webhooks.handle(provider, req.rawBody, req.headers);
    return { received: true };
  }
}
