import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";

import {
  BILLING_PROVIDER_METADATA,
  BillingProviderRegistration,
  PaymentProvider,
} from "./payment-provider.interface";

@Injectable()
export class PaymentProviderManager {
  constructor(
    private _moduleRef: ModuleRef,
    private readonly config: ConfigService,
  ) {}

  /** BILLING_PROVIDERS, for example "razorpay,dodo". Anything not listed is treated as not installed. */
  enabledNames(): string[] {
    return (this.config.get<string>("BILLING_PROVIDERS") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  tryGet(name: string): PaymentProvider | null {
    if (!this.enabledNames().includes(name)) return null;
    const found = this.registered().find((r) => r.provider === name);
    return found ? this._moduleRef.get(found.target, { strict: false }) : null;
  }

  get(name: string): PaymentProvider {
    const provider = this.tryGet(name);
    if (!provider) {
      throw new Error(
        `Payment provider '${name}' is not enabled. Enabled: ${this.enabledNames().join(", ") || "(none)"}`,
      );
    }
    return provider;
  }

  private registered(): BillingProviderRegistration[] {
    return (
      Reflect.getMetadata(BILLING_PROVIDER_METADATA, PaymentProvider) || []
    );
  }
}
