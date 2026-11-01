import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { MessageRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async getMessages(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async addMessage(
    conversationId: string,
    userId: string,
    content: string,
    role: MessageRole = MessageRole.USER,
  ) {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new BadRequestException("Message cannot be empty");
    }

    // Clients must not impersonate the assistant or system.
    if (role !== MessageRole.USER) {
      throw new BadRequestException(
        "Only user messages can be submitted through this operation",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      const message = await tx.message.create({
        data: {
          conversationId,
          role: MessageRole.USER,
          content: normalizedContent,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return message;
    });
  }

  // Internal application operation, called by ChatService
  // after an AI response has been generated.
  async addAssistantMessage(conversationId: string, content: string) {
    const normalizedContent = content.trim();

    if (!normalizedContent) {
      throw new BadRequestException("Assistant response cannot be empty");
    }

    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      const message = await tx.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: normalizedContent,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return message;
    });
  }
}
