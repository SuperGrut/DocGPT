export type Count = (text: string) => number;

/** A piece of text plus the separator that preceded it in the source. */
export interface Part {
  text: string;
  joiner: string;
}

export interface Level {
  pattern: RegExp;
  joiner: string;
}

/** Last resort for text with no usable separators (long URLs, base64). Cuts by characters. */
export function hardSplit(text: string, max: number, count: Count): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length) {
    let len = Math.max(
      1,
      Math.floor((rest.length * max) / Math.max(1, count(rest))),
    );
    let slice = rest.slice(0, len);
    while (len > 1 && count(slice) > max) {
      len = Math.max(1, Math.floor(len * 0.8));
      slice = rest.slice(0, len);
    }
    out.push(slice);
    rest = rest.slice(slice.length);
  }
  return out;
}

/**
 * Splits text into parts that each fit `max` tokens, trying the coarsest separator first.
 * A part that already fits is never split further. The first part gets `joiner`.
 */
export function splitRecursive(
  text: string,
  max: number,
  count: Count,
  levels: Level[],
  joiner = "",
): Part[] {
  if (count(text) <= max) return [{ text, joiner }];

  const [level, ...rest] = levels;
  if (!level) {
    return hardSplit(text, max, count).map((t, i) => ({
      text: t,
      joiner: i === 0 ? joiner : "",
    }));
  }

  const pieces = text
    .split(level.pattern)
    .map((s) => s.trim())
    .filter(Boolean);
  if (pieces.length <= 1) return splitRecursive(text, max, count, rest, joiner);

  return pieces.flatMap((piece, i) =>
    splitRecursive(piece, max, count, rest, i === 0 ? joiner : level.joiner),
  );
}

/** Splits a markdown table by rows, repeating the header row in every part. */
export function splitTable(
  markdown: string,
  max: number,
  count: Count,
): string[] {
  const md = markdown.trim();
  if (!md) return [];
  if (count(md) <= max) return [md];

  const lines = md.split("\n").filter((l) => l.trim());
  const hasHeader =
    lines.length > 2 && /^[\s|:-]+$/.test(lines[1]) && lines[1].includes("-");
  const header = hasHeader ? lines.slice(0, 2) : [];
  const rows = hasHeader ? lines.slice(2) : lines;

  const parts: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length) parts.push([...header, ...cur].join("\n"));
    cur = [];
  };

  for (const row of rows) {
    if (cur.length && count([...header, ...cur, row].join("\n")) > max) flush();
    const alone = [...header, row].join("\n");
    if (!cur.length && count(alone) > max) {
      // One row too big even with the header: cut it by characters.
      parts.push(...hardSplit(alone, max, count));
      continue;
    }
    cur.push(row);
  }
  flush();

  return parts.length ? parts : hardSplit(md, max, count);
}
