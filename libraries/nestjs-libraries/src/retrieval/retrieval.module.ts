import { Module } from "@nestjs/common";

import { TokenCounter } from "../chunker/chunker.interface";
import { ApproxTokenCounter } from "../chunker/token-counter";
import { EmbedderModule } from "../embedder/embedder.module";
import { ContextCompressor } from "./compress/context.compressor";
import { CohereReranker } from "./rerank/providers/cohere.reranker.provider";
import { LlmReranker } from "./rerank/providers/llm.reranker.provider";
import { NoopReranker } from "./rerank/providers/noop.reranker.provider";
import { RerankerManager } from "./rerank/providers/reranker.manager";
import { TeiReranker } from "./rerank/providers/tei.reranker.provider";
import { RetrievalLlm } from "./retrieval.ports";
import { RetrievalRepository } from "./retrieval.repository";
import { RetrievalService } from "./retrieval.service";

@Module({
  imports: [EmbedderModule /*, LlmModule */],
  providers: [
    RetrievalService,
    RetrievalRepository,
    ContextCompressor,
    { provide: TokenCounter, useClass: ApproxTokenCounter }, // swap for your tiktoken counter if you bound one
    CohereReranker, // importing the classes is what runs their decorators
    TeiReranker,
    LlmReranker,
    NoopReranker,
    RerankerManager,
    { provide: RetrievalLlm, useExisting: LlmService }, // your LLM client; add an adapter if signatures differ
  ],
  exports: [RetrievalService],
})
export class RetrievalModule {}
