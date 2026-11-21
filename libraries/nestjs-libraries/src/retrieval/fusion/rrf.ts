export interface RankedList {
  name: string;
  /** Best first. */
  ids: string[];
  weight?: number;
}

export interface FusedItem {
  id: string;
  score: number;
  /** 1-based rank in each list the id appeared in. */
  ranks: Record<string, number>;
}

/**
 * Reciprocal Rank Fusion: score(d) = sum over lists of weight / (k + rank).
 * Uses ranks only, so scores from different systems (cosine vs ts_rank) never need normalizing.
 */
export function reciprocalRankFusion(lists: RankedList[], k = 60): FusedItem[] {
  const items = new Map<string, FusedItem>();

  for (const list of lists) {
    const weight = list.weight ?? 1;
    list.ids.forEach((id, i) => {
      const item = items.get(id) ?? { id, score: 0, ranks: {} };
      if (item.ranks[list.name] === undefined) {
        item.ranks[list.name] = i + 1;
        item.score += weight / (k + i + 1);
      }
      items.set(id, item);
    });
  }

  const bestRank = (f: FusedItem) => Math.min(...Object.values(f.ranks));
  return [...items.values()].sort(
    (a, b) =>
      b.score - a.score || bestRank(a) - bestRank(b) || (a.id < b.id ? -1 : 1),
  );
}
