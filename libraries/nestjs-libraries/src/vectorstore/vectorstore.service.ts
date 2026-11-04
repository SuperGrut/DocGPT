import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  DeleteVectorsInput,
  VectorRecord,
  VectorSearchInput,
  VectorSearchResult,
} from "./interfaces/vector-store.interface";

import {
  VectorStoreProvider,
  VectorStoreRegistry,
} from "./vector-store.registry";

@Injectable()
export class VectorStorageService {
  private readonly logger = new Logger(VectorStorageService.name);

  private readonly store;

  constructor(
    private readonly registry: VectorStoreRegistry,
    configService: ConfigService,
  ) {
    const provider = configService.get<VectorStoreProvider>(
      "VECTOR_STORE_PROVIDER",
      "PGVECTOR",
    );

    this.store = this.registry.get(provider);

    this.logger.log(`Using vector store: ${provider}`);
  }

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    await this.store.upsert(records);

    this.logger.log(`Upserted ${records.length} vector records`);
  }

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    return this.store.search(input);
  }

  async deleteByDocument(input: DeleteVectorsInput): Promise<void> {
    await this.store.deleteByDocument(input);

    this.logger.log(`Deleted vectors for document ${input.documentId}`);
  }
}
