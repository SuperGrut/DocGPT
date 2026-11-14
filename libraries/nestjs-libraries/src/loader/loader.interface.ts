import { Injectable } from "@nestjs/common";

export type Block =
  | { type: "text"; order: number; page?: number; text: string }
  | { type: "table"; order: number; page?: number; markdown: string }
  | {
      type: "image";
      order: number;
      page?: number;
      assetKey: string;
      caption?: string;
    };

export interface LoadedDocument {
  blocks: Block[];
  metadata: { pageCount?: number; title?: string };
  loaderName: string;
  loaderVersion: string;
}

export interface LoaderInput {
  buffer: Buffer;
  fileName: string;
  docId: string;
  maxPages: number;
}

export abstract class DocumentLoader {
  /** Stable identifier, recorded with the parsed output. */
  abstract readonly name: string;
  /** Bump whenever extraction output changes, so stale documents can be re-ingested. */
  abstract readonly version: string;
  abstract load(input: LoaderInput): Promise<LoadedDocument>;
}

export interface LoaderRegistration {
  target: any;
  mimeTypes: string[];
}

export const LOADER_METADATA = "document-loader";

export function Loader(params: { mimeTypes: string[] }) {
  return function (target: any) {
    Injectable()(target);

    const existing: LoaderRegistration[] =
      Reflect.getMetadata(LOADER_METADATA, DocumentLoader) || [];

    for (const mime of params.mimeTypes) {
      if (existing.some((r) => r.mimeTypes.includes(mime))) {
        throw new Error(`Duplicate loader for MIME type '${mime}'`);
      }
    }

    existing.push({ target, mimeTypes: params.mimeTypes });

    Reflect.defineMetadata(LOADER_METADATA, existing, DocumentLoader);
  };
}
