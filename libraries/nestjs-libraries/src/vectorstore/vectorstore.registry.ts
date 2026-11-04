import { Injectable, NotFoundException } from "@nestjs/common";

import { VectorStore } from "./interfaces/vector-store.interface";
import { PgVectorStore } from "./providers/pgvector.store";

export type VectorStoreProvider = "PGVECTOR" | "QDRANT";

@Injectable()
export class VectorStoreRegistry {
  private readonly stores: Map<VectorStoreProvider, VectorStore>;

  constructor(pgVectorStore: PgVectorStore) {
    this.stores = new Map([["PGVECTOR", pgVectorStore]]);
  }

  get(provider: VectorStoreProvider): VectorStore {
    const store = this.stores.get(provider);

    if (!store) {
      throw new NotFoundException(
        `Vector store provider ${provider} is not registered`,
      );
    }

    return store;
  }
}
