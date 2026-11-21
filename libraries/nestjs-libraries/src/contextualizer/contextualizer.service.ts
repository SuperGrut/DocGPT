import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { TokenCounter } from "@docgpt/nestjs-libraries/chunker/chunker.interface";
import type { LoadedDocument } from "@docgpt/nestjs-libraries/loader/loader.interface";
import { PrismaService } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import {
  ChunkContextualizer,
  ContextualizerError,
  ContextualizerRequestError,
} from "@docgpt/nestjs-libraries/contextualizer/contextualizer.interface";
import { CONTEXT_PROMPT_VERSION } from "./contextualizer.prompt";
import { buildWindows } from "./contextualizer.windows";
import { ContextualizerManager } from "./providers/contextualizer.manager";

const FLUSH_EVERY = 25;
/** Above this share of failed chunks the step throws, so Temporal retries just the missing ones. */
const MAX_FAILURE_RATIO = 0.2;

@Injectable()
export class ContextualizerService implements OnModuleInit {
  private readonly logger = new Logger(ContextualizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly manager: ContextualizerManager,
    private readonly tokens: TokenCounter,
    private readonly config: ConfigService,
  ) {}

  // Fail at boot, not on the first document.
  onModuleInit() {
    this.provider().validate();
  }

  /** `onProgress` lets the Temporal activity heartbeat without this service importing Temporal. */
  async contextualize(documentId: string, onProgress?: () => void) {
    const provider = this.provider();
    if (!provider.enabled) {
      return {
        documentId,
        model: null,
        contextualizedCount: 0,
        failedCount: 0,
      };
    }

    const model = `${provider.model}@${CONTEXT_PROMPT_VERSION}`;
    const maxTokens = Number(this.config.get("CONTEXT_MAX_TOKENS") ?? 100);

    // Only chunks without a context from this model and prompt version, so a retry resumes where it stopped.
    const pending = await this.prisma.documentChunk.findMany({
      where: {
        documentId,
        OR: [{ context: null }, { contextModel: { not: model } }],
      },
      orderBy: { index: "asc" },
      select: { id: true, text: true, sourceBlocks: true },
    });
    if (pending.length === 0) {
      return { documentId, model, contextualizedCount: 0, failedCount: 0 };
    }

    const parse = await this.prisma.documentParse.findUnique({
      where: { documentId },
    });
    if (!parse) {
      throw new ContextualizerError(
        `No parsed output for document ${documentId}; run the loader first`,
      );
    }
    const loaded = parse.data as unknown as LoadedDocument;
    if (!Array.isArray(loaded?.blocks)) {
      throw new ContextualizerError(
        `Parsed output for ${documentId} has no blocks`,
      );
    }

    const { windows, windowOf } = buildWindows(
      loaded,
      provider.maxDocumentTokens,
      this.tokens,
    );

    // Chunks that share a window share a prompt prefix.
    const groups = new Map<number, typeof pending>();
    for (const chunk of pending) {
      const w = windowOf.get(chunk.sourceBlocks[0]) ?? 0;
      const list = groups.get(w);
      if (list) list.push(chunk);
      else groups.set(w, [chunk]);
    }

    const buffer: { id: string; context: string }[] = [];
    let saved = 0;
    let failed = 0;

    // Writing a context invalidates the chunk's vectors, so both happen in one transaction.
    // The embedder then re-embeds exactly those chunks.
    const flush = async () => {
      const batch = buffer.splice(0);
      if (batch.length === 0) return;
      await this.prisma.$transaction([
        ...batch.map((b) =>
          this.prisma.documentChunk.update({
            where: { id: b.id },
            data: { context: b.context, contextModel: model },
          }),
        ),
        this.prisma.chunkEmbedding.deleteMany({
          where: { chunkId: { in: batch.map((b) => b.id) } },
        }),
      ]);
      saved += batch.length;
    };

    const one = async (windowText: string, chunk: (typeof pending)[number]) => {
      try {
        const raw = await provider.contextualize({
          document: windowText,
          chunk: chunk.text,
          maxTokens,
        });
        const context = cleanContext(raw);
        if (!context) {
          failed++;
          return;
        }
        buffer.push({ id: chunk.id, context });
        if (buffer.length >= FLUSH_EVERY) await flush();
      } catch (e) {
        if (e instanceof ContextualizerRequestError && e.fatal) throw e; // bad key or model: stop now
        failed++;
        this.logger.warn(
          `Chunk ${chunk.id} not contextualized: ${(e as Error).message}`,
        );
      } finally {
        onProgress?.();
      }
    };

    try {
      for (const w of [...groups.keys()].sort((a, b) => a - b)) {
        const windowText = windows[w] ?? windows[0] ?? "";
        const [first, ...rest] = groups.get(w)!;
        // The first chunk runs alone so the provider's prompt cache is warm before the rest fan out.
        await one(windowText, first);
        await runPool(rest, provider.maxConcurrency, (chunk) =>
          one(windowText, chunk),
        );
      }
    } finally {
      await flush().catch((e: Error) =>
        this.logger.error(`Could not save contexts: ${e.message}`),
      );
    }

    this.logger.log(
      `Contextualized ${saved}/${pending.length} chunks of ${documentId} with ${model}`,
    );

    if (failed / pending.length > MAX_FAILURE_RATIO) {
      throw new ContextualizerError(
        `${failed} of ${pending.length} chunks could not be contextualized`,
      );
    }

    // Return a reference only, like the loader, chunker and embedder.
    return {
      documentId,
      model,
      contextualizedCount: saved,
      failedCount: failed,
    };
  }

  private provider(): ChunkContextualizer {
    return this.manager.get(
      this.config.get<string>("CONTEXTUALIZER_PROVIDER") ?? "none",
    );
  }
}

/** Models sometimes add a label or wrap the answer in quotes. */
function cleanContext(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^(situating\s+)?context\s*:\s*/i, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
}

/** Runs `fn` over `items` with at most `limit` in flight. Stops starting new work after the first error. */
async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let error: unknown;
  let failedRun = false;

  const worker = async () => {
    while (!failedRun) {
      const i = next++;
      if (i >= items.length) return;
      try {
        await fn(items[i]);
      } catch (e) {
        failedRun = true;
        error = e;
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker),
  );
  if (failedRun) throw error;
}
