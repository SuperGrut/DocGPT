import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { AuthGuard } from "../auth/auth.guard"; // match your auth setup
import { CurrentUserId } from "../auth/current-user.decorator"; // match your auth setup
import {
  CreateChatDto,
  ListChatsQueryDto,
  ListMessagesQueryDto,
  SendMessageDto,
  UpdateChatDto,
} from "@docgpt/nestjs-libraries/dtos/chat/chat.dto";
import { ChatService } from "@docgpt/nestjs-libraries/database/prisma/chat/chat.service";
import type { ChatEvent } from "@docgpt/nestjs-libraries/database/prisma/chat/chat.types";

@Controller("/chats")
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chats: ChatService) {}

  @Post()
  create(@CurrentUserId() userId: string, @Body() dto: CreateChatDto) {
    return this.chats.createChat(userId, dto);
  }

  @Get()
  list(@CurrentUserId() userId: string, @Query() q: ListChatsQueryDto) {
    return this.chats.listChats(userId, q);
  }

  @Get(":id")
  get(@CurrentUserId() userId: string, @Param("id") id: string) {
    return this.chats.getChat(userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateChatDto,
  ) {
    return this.chats.updateChat(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentUserId() userId: string, @Param("id") id: string) {
    await this.chats.deleteChat(userId, id);
  }

  @Get(":id/messages")
  messages(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Query() q: ListMessagesQueryDto,
  ) {
    return this.chats.listMessages(userId, id, q);
  }

  @Post(":id/messages")
  async send(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ) {
    await this.stream(res, (signal) =>
      this.chats.sendMessage(userId, id, dto.content, signal),
    );
  }

  @Post(":id/messages/:messageId/regenerate")
  async regenerate(
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Res() res: Response,
  ) {
    await this.stream(res, (signal) =>
      this.chats.regenerate(userId, id, messageId, signal),
    );
  }

  /** Server-Sent Events over POST. `open` validates first, so its errors are plain HTTP errors. */
  private async stream(
    res: Response,
    open: (signal: AbortSignal) => Promise<AsyncGenerator<ChatEvent>>,
  ) {
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort(); // client went away
    });

    const events = await open(abort.signal);

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // stop nginx from buffering the stream
    });
    res.flushHeaders();

    try {
      for await (const event of events) {
        // Keep draining after a disconnect so the service can save the partial answer and unlock.
        if (res.writableEnded || res.destroyed) continue;
        res.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`,
        );
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
}
