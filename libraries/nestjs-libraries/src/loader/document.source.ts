/**
 * Where a document's bytes come from. A discriminated union: `kind` says which loader handles it.
 *
 * Today there is one kind, 'storage' (a file in the app's own object storage). To add another
 * (a URL, Google Drive...): add a member here, write a loader for it, and register the loader in
 * loader.module.ts. Nothing that already works has to change.
 */
export type DocumentSource = {
  kind: "storage";
  /** Name of the storage adapter that holds the file: 'local', 's3', 'r2'. */
  provider: string;
  key: string;
};

export type DocumentSourceKind = DocumentSource["kind"];

/** The member of DocumentSource with the given kind. Lets each loader accept only its own source. */
export type SourceOfKind<K extends DocumentSourceKind> = Extract<
  DocumentSource,
  { kind: K }
>;

/** The source of a document that was uploaded through the Documents module. */
export function storageSourceOf(document: {
  storageProvider: string;
  storageKey: string;
}): SourceOfKind<"storage"> {
  return {
    kind: "storage",
    provider: document.storageProvider,
    key: document.storageKey,
  };
}

/**
 * A short text for logs and error messages. Names and ids only, never credentials.
 * It is a switch on purpose: when a new kind is added to DocumentSource, the compiler
 * points here and forces you to describe it.
 */
export function describeSource(source: DocumentSource): string {
  switch (source.kind) {
    case "storage":
      return `storage:${source.provider}/${source.key}`;
  }
}
