import { Module } from "@nestjs/common";

import { ChunkerModule } from "@docgpt/nestjs-libraries/chunker/chunker.module";
import { ContextualizerService } from "@docgpt/nestjs-libraries/contextualizer/contextualizer.service";
import { ContextualizerManager } from "@docgpt/nestjs-libraries/contextualizer/providers/contextualizer.manager";
import { AnthropicContextualizer } from "@docgpt/nestjs-libraries/contextualizer/providers/anthropic.contextualizer.provider";
import { LocalContextualizer } from "@docgpt/nestjs-libraries/contextualizer/providers/openai.compatible.contextualizer";
import { NoopContextualizer } from "@docgpt/nestjs-libraries/contextualizer/providers/noop.contextualizer.provider";

@Module({
  imports: [ChunkerModule], // for TokenCounter; see the export change below
  providers: [
    AnthropicContextualizer, // importing the classes is what runs their @Contextualizer decorators
    LocalContextualizer,
    NoopContextualizer,
    ContextualizerManager,
    ContextualizerService,
  ],
  exports: [ContextualizerService],
})
export class ContextualizerModule {}