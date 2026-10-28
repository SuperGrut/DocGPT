import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { MessageService } from "./message.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("conversations/:conversationId/messages")
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  getMessages(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
  ) {
    return this.messageService.getMessages(conversationId, userId);
  }

  @Post()
  addMessage(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
    @Body() body: { content: string },
  ) {
    return this.messageService.addMessage(conversationId, userId, body.content);
  }
}
