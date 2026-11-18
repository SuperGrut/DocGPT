export interface VectorRow {
  chunkId: string;
  model: string;
  vector: number[];
}

/** Only upsert for now. search() joins this port when we build retrieval. */
export abstract class VectorStore {
  abstract upsert(rows: VectorRow[]): Promise<void>;
}
