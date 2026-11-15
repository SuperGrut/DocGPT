import { createHash } from "node:crypto";

import {
  Chunk,
  ChunkedDocument,
  ChunkerInput,
  DocumentChunker,
  TokenCounter,
} from "@docgpt/nestjs-libraries/chunker/chunker.interface";
import {
  Part,
  splitTable,
} from "@docgpt/nestjs-libraries/chunker/chunker.utils";

interface Piece extends Part {
  order: number;
  page?: number;
}

interface RawChunk {
  text: string;
  orders: number[];
  pages: number[];
}

/**
 * Shared block-aware packing. Strategies only decide how text is split into pieces.
 *  - text blocks are merged up to maxTokens, with piece-level overlap between chunks
 *  - tables are never merged with text (split by rows only when too large)
 *  - an image caption becomes its own small chunk; images without a caption are skipped
 */
export abstract class BlockChunker extends DocumentChunker {
  constructor(protected readonly tokens: TokenCounter) {
    super();
  }

  /** Split text into parts that each fit maxTokens. The first part's joiner is ignored. */
  protected abstract splitText(text: string, maxTokens: number): Part[];

  chunk(input: ChunkerInput): ChunkedDocument {
    const { documentId, maxTokens, overlapTokens } = input;
    if (!(maxTokens > 0) || overlapTokens < 0 || overlapTokens >= maxTokens) {
      throw new Error(
        `Invalid sizes: maxTokens=${maxTokens}, overlapTokens=${overlapTokens} (need 0 <= overlap < max)`,
      );
    }

    const count = (s: string) => this.tokens.count(s);
    const blocks = [...input.blocks].sort((a, b) => a.order - b.order);
    const raw: RawChunk[] = [];

    let buf: Piece[] = [];
    let bufText = "";
    const push = (p: Piece) => {
      bufText = buf.length ? bufText + p.joiner + p.text : p.text;
      buf.push(p);
    };
    const reset = (carry: Piece[]) => {
      buf = [];
      bufText = "";
      carry.forEach((p) => push(p));
    };
    const flush = () => {
      if (buf.length) raw.push(this.toRaw(buf, bufText));
      reset([]);
    };

    const addText = (
      text: string,
      order: number,
      page: number | undefined,
      isolated: boolean,
    ) => {
      const clean = text.replace(/\r\n?/g, "\n").trim();
      if (!clean) return;
      if (isolated) flush();

      this.splitText(clean, maxTokens).forEach((part, i) => {
        const piece: Piece = {
          text: part.text,
          joiner: i === 0 ? "\n\n" : part.joiner,
          order,
          page,
        };
        if (
          buf.length &&
          count(bufText + piece.joiner + piece.text) > maxTokens
        ) {
          const prev = buf;
          raw.push(this.toRaw(prev, bufText));
          reset(this.overlap(prev, piece, maxTokens, overlapTokens));
        }
        push(piece);
      });

      if (isolated) flush();
    };

    for (const block of blocks) {
      switch (block.type) {
        case "text":
          addText(block.text, block.order, block.page, false);
          break;
        case "table":
          flush();
          for (const text of splitTable(block.markdown, maxTokens, count)) {
            raw.push({
              text,
              orders: [block.order],
              pages: block.page === undefined ? [] : [block.page],
            });
          }
          break;
        case "image":
          if (block.caption)
            addText(block.caption, block.order, block.page, true);
          break;
      }
    }
    flush();

    const chunks: Chunk[] = raw.map((r, index) => ({
      id: createHash("sha256")
        .update(`${documentId}\n${this.version}\n${index}\n${r.text}`)
        .digest("hex"),
      index,
      text: r.text,
      tokenCount: count(r.text),
      pageStart: r.pages.length ? Math.min(...r.pages) : undefined,
      pageEnd: r.pages.length ? Math.max(...r.pages) : undefined,
      sourceBlocks: r.orders,
    }));

    return { chunks, chunkerName: this.name, chunkerVersion: this.version };
  }

  /**
   * Trailing pieces of the previous chunk, up to overlapTokens, to open the next chunk with.
   * If the last piece is too big, it is split finer so a partial tail can still be used.
   */
  private overlap(
    prev: Piece[],
    next: Piece,
    maxTokens: number,
    overlapTokens: number,
  ): Piece[] {
    if (overlapTokens <= 0) return [];
    const count = (s: string) => this.tokens.count(s);

    let carry: Piece[] = [];
    for (let i = prev.length - 1; i >= 0; i--) {
      const p = prev[i];
      const whole = [p, ...carry];
      if (count(this.join(whole)) <= overlapTokens) {
        carry = whole;
        continue;
      }
      const subs: Piece[] = this.splitText(p.text, overlapTokens).map((s) => ({
        ...s,
        order: p.order,
        page: p.page,
      }));
      for (let j = subs.length - 1; j >= 0; j--) {
        const withSub = [subs[j], ...carry];
        if (count(this.join(withSub)) > overlapTokens) break;
        carry = withSub;
      }
      break;
    }

    // The carried text plus the next piece must still fit in one chunk.
    while (carry.length && count(this.join([...carry, next])) > maxTokens) {
      carry = carry.slice(1);
    }
    return carry;
  }

  private join(pieces: Piece[]): string {
    return pieces
      .map((p, i) => (i === 0 ? p.text : p.joiner + p.text))
      .join("");
  }

  private toRaw(pieces: Piece[], text: string): RawChunk {
    return {
      text,
      orders: [...new Set(pieces.map((p) => p.order))].sort((a, b) => a - b),
      pages: pieces
        .map((p) => p.page)
        .filter((p): p is number => p !== undefined),
    };
  }
}
