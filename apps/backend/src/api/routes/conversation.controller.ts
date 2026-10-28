
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
} from "@nestjs/common";

import { ConversationService } from "./conversation.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("conversations")
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
  ) {}

  @Post()
  create(
    @CurrentUser("id") userId: string,
    @Body() body: { title?: string },
  ) {
    return this.conversationService.createConversation(
      userId,
      body.title,
    );
  }

  @Get()
  findAll(@CurrentUser("id") userId: string) {
    return this.conversationService.getUserConversations(userId);
  }

  @Get(":conversationId")
  findOne(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
  ) {
    return this.conversationService.getConversation(
      conversationId,
      userId,
    );
  }

  @Patch(":conversationId/title")
  updateTitle(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
    @Body() body: { title: string },
  ) {
    return this.conversationService.updateTitle(
      conversationId,
      userId,
      body.title,
    );
  }

  @Post(":conversationId/documents/:documentId")
  addDocument(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.conversationService.addDocument(
      conversationId,
      userId,
      documentId,
    );
  }

  @Delete(":conversationId/documents/:documentId")
  removeDocument(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
    @Param("documentId") documentId: string,
  ) {
    return this.conversationService.removeDocument(
      conversationId,
      userId,
      documentId,
    );
  }

  @Delete(":conversationId")
  delete(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
  ) {
    return this.conversationService.deleteConversation(
      conversationId,
      userId,
    );
  }
}
