import { Inject, Injectable } from "@nestjs/common";

import { DOCUMENT_LOADERS } from "./document.loader";
import type { DocumentLoader } from "./document.loader";
import type { DocumentSource, DocumentSourceKind } from "./document-source";
import type { LoadLimits, LoadedDocument } from "./loaded-document";

/**
 * Finds the loader for a source. Callers usually just call load(): the kind inside the
 * source picks the loader, so they never need to know which origins exist.
 */
@Injectable()
export class LoaderRegistry {
  private readonly byKind = new Map<DocumentSourceKind, DocumentLoader>();

  constructor(@Inject(DOCUMENT_LOADERS) loaders: DocumentLoader[]) {
    for (const loader of loaders) {
      // Two loaders for one kind is a configuration mistake: fail at boot, not on the first document.
      if (this.byKind.has(loader.kind))
        throw new Error(`Two loaders claim the source kind '${loader.kind}'`);
      this.byKind.set(loader.kind, loader);
    }
  }

  kinds(): DocumentSourceKind[] {
    return [...this.byKind.keys()];
  }

  get<K extends DocumentSourceKind>(kind: K): DocumentLoader<K> {
    const loader = this.byKind.get(kind);
    if (!loader) {
      throw new Error(
        `No loader is enabled for source kind '${kind}'. Enabled: ${this.kinds().join(", ") || "(none)"}`,
      );
    }
    // The map is keyed by kind, so the loader stored under K really is a DocumentLoader<K>.
    return loader as unknown as DocumentLoader<K>;
  }

  load(source: DocumentSource, limits: LoadLimits): Promise<LoadedDocument> {
    return (this.get(source.kind) as unknown as DocumentLoader).load(
      source,
      limits,
    );
  }
}
