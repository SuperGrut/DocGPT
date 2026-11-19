import { Injectable } from "@nestjs/common";
import type {
  ChatMessageRole,
  ChatMessageStatus,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "@docgpt/nestjs-libraries/database/prisma/prisma.service"; // match your other repositories
import type { ChatSource } from "@docgpt/nestjs-libraries/database/prisma/chat/chat.types";

export interface NewMessage {
  chatId: string;
  role: ChatMessageRole;
  content: string;
  status?: ChatMessageStatus;
  sources?: ChatSource[];
}

const messageData = (
  m: NewMessage,
): Prisma.ChatMessageUncheckedCreateInput => ({
  chatId: m.chatId,
  role: m.role,
  content: m.content,
  status: m.status ?? "COMPLETE",
  sources: (m.sources ?? []) as unknown as Prisma.InputJsonValue,
});

function paginate<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- chats ----

  createChat(data: {
    userId: string;
    title: string | null;
    documentIds: string[];
  }) {
    return this.prisma.chat.create({ data });
  }

  findOwned(userId: string, id: string) {
    return this.prisma.chat.findFirst({ where: { id, userId } });
  }

  async listChats(userId: string, page: { cursor?: string; limit: number }) {
    const rows = await this.prisma.chat.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    return paginate(rows, page.limit);
  }

  updateChat(id: string, data: { title?: string; documentIds?: string[] }) {
    return this.prisma.chat.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.chat.deleteMany({
      where: { id, userId },
    });
    return count > 0;
  }

  /** Compare-and-set lock. A lock older than `staleBefore` is treated as abandoned (crashed server). */
  async acquireLock(
    userId: string,
    chatId: string,
    staleBefore: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.chat.updateMany({
      where: {
        id: chatId,
        userId,
        OR: [
          { generatingSince: null },
          { generatingSince: { lt: staleBefore } },
        ],
      },
      data: { generatingSince: new Date() },
    });
    return count === 1;
  }

  async releaseLock(chatId: string): Promise<void> {
    await this.prisma.chat.updateMany({
      where: { id: chatId },
      data: { generatingSince: null },
    });
  }

  /** Only sets the title if nobody (user rename, earlier run) already did. */
  async setTitleIfEmpty(chatId: string, title: string): Promise<boolean> {
    const { count } = await this.prisma.chat.updateMany({
      where: { id: chatId, title: null },
      data: { title },
    });
    return count > 0;
  }

  /** Cross-domain read: used to validate a chat's document scope. */
  countOwnedDocuments(userId: string, ids: string[]) {
    return this.prisma.document.count({ where: { userId, id: { in: ids } } });
  }

  // ---- messages ----

  /** Chronological page of messages older than `before` (or the latest, if omitted). */
  async listMessages(chatId: string, page: { before?: string; limit: number }) {
    const rows = await this.prisma.chatMessage.findMany({
      where: { chatId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: page.limit + 1,
      ...(page.before ? { cursor: { id: page.before }, skip: 1 } : {}),
    });
    const { items, nextCursor } = paginate(rows, page.limit);
    return { items: [...items].reverse(), nextCursor };
  }

  findMessage(chatId: string, id: string) {
    return this.prisma.chatMessage.findFirst({ where: { id, chatId } });
  }

  findLastMessage(chatId: string) {
    return this.prisma.chatMessage.findFirst({
      where: { chatId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async createMessage(data: NewMessage) {
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({ data: messageData(data) }),
      this.prisma.chat.update({
        where: { id: data.chatId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  /** Atomically swaps an old message for a new one (regenerate). */
  async replaceMessage(oldId: string, data: NewMessage) {
    const [, message] = await this.prisma.$transaction([
      this.prisma.chatMessage.delete({ where: { id: oldId } }),
      this.prisma.chatMessage.create({ data: messageData(data) }),
      this.prisma.chat.update({
        where: { id: data.chatId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }
}
