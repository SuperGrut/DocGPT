// chat/chat.controller.ts

import { Body, Controller, Post, Param, UseGuards } from "@nestjs/common";

import { ChatService } from "./chat.service";
import { ChatDto } from "./dto/chat.dto";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("conversations/:conversationId/chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(
    @CurrentUser("id") userId: string,
    @Param("conversationId") conversationId: string,
    @Body() dto: ChatDto,
  ) {
    return this.chatService.chat(userId, conversationId, dto.content);
  }
}
