import { DynamicModule, FactoryProvider, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { STORAGE_PROVIDERS, StorageProvider } from "../ports/storage.port";
import { LocalStorageController } from "./local/local-storage.controller";
import { LocalStorageProvider } from "./local/local.storage";
import { S3StorageConfig, S3StorageProvider } from "./s3.storage";
import { StorageManager } from "./storage.manager";

/**
 * Which adapters are available for READS. Writes go to STORAGE_DRIVER, which must be in this list.
 *   STORAGE_DRIVER=s3
 *   STORAGE_ENABLED_DRIVERS=s3,local     (optional; defaults to STORAGE_DRIVER)
 */
export function enabledStorageDrivers(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const raw = env.STORAGE_ENABLED_DRIVERS ?? env.STORAGE_DRIVER ?? "local";
  return [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function readS3Config(
  cfg: ConfigService,
  prefix: "S3" | "R2",
): S3StorageConfig {
  return {
    bucket: cfg.getOrThrow<string>(`${prefix}_BUCKET`),
    region:
      cfg.get<string>(`${prefix}_REGION`) ??
      (prefix === "R2" ? "auto" : "us-east-1"),
    endpoint: cfg.get<string>(`${prefix}_ENDPOINT`) || undefined,
    publicEndpoint: cfg.get<string>(`${prefix}_PUBLIC_ENDPOINT`) || undefined,
    accessKeyId: cfg.getOrThrow<string>(`${prefix}_ACCESS_KEY_ID`),
    secretAccessKey: cfg.getOrThrow<string>(`${prefix}_SECRET_ACCESS_KEY`),
    // Parse booleans explicitly: any non-empty string is truthy, including 'false'.
    forcePathStyle: cfg.get<string>(`${prefix}_FORCE_PATH_STYLE`) === "true",
  };
}

/**
 * THE swap point for storage. A new backend (GCS, Azure Blob...) = implement StorageProvider,
 * add one case here, and pass the shared contract tests.
 */
export function createStorageAdapter(
  driver: string,
  cfg: ConfigService,
): StorageProvider {
  switch (driver) {
    case "local": {
      if (
        process.env.NODE_ENV === "production" &&
        cfg.get<string>("STORAGE_LOCAL_ALLOW_PRODUCTION") !== "true"
      ) {
        throw new Error(
          "The 'local' storage driver is for development only. Use s3 or r2 in production.",
        );
      }
      return new LocalStorageProvider({
        baseDir: cfg.get<string>("STORAGE_LOCAL_DIR") ?? "./.storage",
        publicBaseUrl: cfg
          .getOrThrow<string>("STORAGE_LOCAL_PUBLIC_URL")
          .replace(/\/+$/, ""),
        secret: cfg.getOrThrow<string>("STORAGE_LOCAL_SECRET"),
      });
    }
    case "s3":
      return new S3StorageProvider("s3", readS3Config(cfg, "S3"));
    case "r2":
      return new S3StorageProvider("r2", readS3Config(cfg, "R2"));
    default:
      throw new Error(`Unknown storage driver '${driver}'`);
  }
}

const storageProvidersFactory: FactoryProvider<StorageProvider[]> = {
  provide: STORAGE_PROVIDERS,
  inject: [ConfigService],
  // Builds only the enabled adapters, so an unused S3 client never needs credentials.
  useFactory: (cfg: ConfigService) =>
    enabledStorageDrivers().map((driver) => createStorageAdapter(driver, cfg)),
};

@Module({})
export class StorageModule {
  /** Requires ConfigModule.forRoot({ isGlobal: true }) somewhere in the app. */
  static forRoot(): DynamicModule {
    const localEnabled = enabledStorageDrivers().includes("local");
    return {
      module: StorageModule,
      providers: [storageProvidersFactory, StorageManager],
      // The signed-URL endpoints exist only while the local driver is enabled.
      controllers: localEnabled ? [LocalStorageController] : [],
      exports: [StorageManager],
    };
  }
}
