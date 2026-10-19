import { Injectable } from "@nestjs/common";

export abstract class AuthProviderAbstract {
  abstract generateLink(): string;
  abstract getToken(): string;
  abstract getUser(): { email: string; id: string };
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
