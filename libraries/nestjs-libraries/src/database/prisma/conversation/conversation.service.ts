import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(userId: string, title?: string) {
    return this.prisma.conversation.create({
      data: {
        userId,
        ...(title?.trim() ? { title: title.trim() } : {}),
      },
    });
  }

  async getUserConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true, documents: true } },
      },
    });
  }

  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        documents: { include: { document: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  async updateTitle(conversationId: string, userId: string, title: string) {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      throw new BadRequestException("Title cannot be empty");
    }

    const result = await this.prisma.conversation.updateMany({
      where: { id: conversationId, userId },
      data: { title: normalizedTitle },
    });

    if (result.count === 0) {
      throw new NotFoundException("Conversation not found");
    }

    return this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
  }

  async addDocument(
    conversationId: string,
    userId: string,
    documentId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, userId },
      });

      if (!conversation) {
        throw new NotFoundException("Conversation not found");
      }

      // Verify that the document belongs to this user.
      const document = await tx.document.findFirst({
        where: { id: documentId, userId },
        select: { id: true },
      });

      if (!document) {
        throw new NotFoundException("Document not found");
      }

      return tx.conversationDocument.upsert({
        where: {
          conversationId_documentId: {
            conversationId,
            documentId,
          },
        },
        create: { conversationId, documentId },
        update: {},
      });
    });
  }

  async removeDocument(
    conversationId: string,
    userId: string,
    documentId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const result = await this.prisma.conversationDocument.deleteMany({
      where: { conversationId, documentId },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        "Document is not attached to this conversation",
      );
    }

    return { success: true };
  }

  async deleteConversation(conversationId: string, userId: string) {
    const result = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });

    if (result.count === 0) {
      throw new NotFoundException("Conversation not found");
    }

    return { success: true };
  }
}
