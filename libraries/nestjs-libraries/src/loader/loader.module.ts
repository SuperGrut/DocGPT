import { FactoryProvider, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { StorageManager } from "../../storage/storage.manager";
import { StorageModule } from "../../storage/storage.module";
import { DOCUMENT_LOADERS } from "./document.loader";
import type { DocumentLoader } from "./document.loader";
import { LoaderRegistry } from "./loader.registry";
import { StorageDocumentLoader } from "./storage.loader";

interface LoaderDependencies {
  storage: StorageManager;
}

/**
 * Every loader the code base knows, by name. THE place to add an origin:
 *   1. add the new kind to DocumentSource
 *   2. write UrlDocumentLoader implements DocumentLoader<'url'>
 *   3. add   url: (deps) => new UrlDocumentLoader(...)   below
 *   4. set   LOADERS_ENABLED=storage,url
 */
const LOADER_FACTORIES: Record<
  string,
  (deps: LoaderDependencies) => DocumentLoader
> = {
  storage: ({ storage }) => new StorageDocumentLoader(storage),
};

/** Exported so it can be tested without starting Nest. */
export function buildLoaders(
  names: readonly string[],
  deps: LoaderDependencies,
): DocumentLoader[] {
  return names.map((name) => {
    const create = LOADER_FACTORIES[name];
    if (!create) {
      throw new Error(
        `Unknown loader '${name}' in LOADERS_ENABLED. Known: ${Object.keys(LOADER_FACTORIES).join(", ")}`,
      );
    }
    return create(deps);
  });
}

const loadersProvider: FactoryProvider<DocumentLoader[]> = {
  provide: DOCUMENT_LOADERS,
  inject: [ConfigService, StorageManager],
  useFactory: (cfg: ConfigService, storage: StorageManager) => {
    const names = (cfg.get<string>("LOADERS_ENABLED") ?? "storage")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    return buildLoaders(names, { storage });
  },
};

/** Needs ConfigModule.forRoot({ isGlobal: true }) in the app, like the storage and parser modules. */
@Module({
  imports: [StorageModule.forRoot()],
  providers: [loadersProvider, LoaderRegistry],
  exports: [LoaderRegistry],
})
export class LoaderModule {}
