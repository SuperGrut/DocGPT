import { AuthProviderAbstract } from "@docgpt/backend/services/auth/provider.interface";
import { ModuleRef } from "@nestjs/core";

export class AuthProvidersManager {
  constructor(private _moduleRef: ModuleRef) {}

  getProvider(provider: string): AuthProviderAbstract {
    const metadata =
      Reflect.getMetadata("auth-provider", AuthProviderAbstract) || [];

    const found = metadata.find((m: any) => m.provider === provider);

    if (!found) {
      throw new Error(`Auth provider ${provider} not found`);
    }

    return this._moduleRef.get(found.target, { strict: false });
  }
}
