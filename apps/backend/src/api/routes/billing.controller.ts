// src/billing/billing.controller.ts

import {
  Controller,
  Get,
  Post,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";

import { BillingService } from "./billing.service";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * GET /billing/plan
   * Returns the current user's plan and limits.
   */
  @Get("plan")
  async getUserPlan(@CurrentUser("id") userId: string) {
    return this.billingService.getUserPlan(userId);
  }

  /**
   * GET /billing/permissions
   * Returns whether the user can upload documents
   * or send messages.
   */
  @Get("permissions")
  async getPermissions(@CurrentUser("id") userId: string) {
    const [canUploadDocument, canSendMessage] = await Promise.all([
      this.billingService.canUploadDocument(userId),
      this.billingService.canSendMessage(userId),
    ]);

    return {
      canUploadDocument,
      canSendMessage,
    };
  }

  /**
   * POST /billing/check-upload
   * Checks whether the user can upload a document.
   */
  @Post("check-upload")
  async checkUploadPermission(@CurrentUser("id") userId: string) {
    const allowed = await this.billingService.canUploadDocument(userId);

    if (!allowed) {
      throw new ForbiddenException(
        "You have reached your document upload limit. Upgrade your plan to continue.",
      );
    }

    return {
      allowed: true,
    };
  }

  /**
   * POST /billing/check-message
   * Checks whether the user can send a message.
   */
  @Post("check-message")
  async checkMessagePermission(@CurrentUser("id") userId: string) {
    const allowed = await this.billingService.canSendMessage(userId);

    if (!allowed) {
      throw new ForbiddenException(
        "You have reached your monthly message limit. Upgrade your plan to continue.",
      );
    }

    return {
      allowed: true,
    };
  }
}
