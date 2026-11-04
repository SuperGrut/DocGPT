export interface LoadDocumentInput {
  documentId: string;
  fileName: string;
  mimeType: string;

  storageProvider: string;
  storageKey: string;
}

export interface LoadedDocument {
  documentId: string;
  fileName: string;
  mimeType: string;

  buffer: Buffer;
  size: number;
}

export interface DocumentLoader {
  readonly name: string;

  supports(input: LoadDocumentInput): boolean;

  load(input: LoadDocumentInput): Promise<LoadedDocument>;
}
