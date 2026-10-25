import { Injectable } from "@nestjs/common";

export abstract class AuthProviderAbstract {
  abstract generateLink(query?: any): Promise<string> | string;
  abstract getToken(code: string, redirectUri?: string): Promise<string>;
  abstract getUser(
    providerToken: string,
  ): Promise<{ email: string; id: string }> | false;
}

export function AuthProvider(params: { provider: string }) {
  return function (target: any) {
    Injectable()(target);

    const existingMetadata =
      Reflect.getMetadata("auth-provider", AuthProviderAbstract) || [];

    existingMetadata.push({ target, provider: params.provider });

    Reflect.defineMetadata(
      "auth-provider",
      existingMetadata,
      AuthProviderAbstract,
    );
  };
}
