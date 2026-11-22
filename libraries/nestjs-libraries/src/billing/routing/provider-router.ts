import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Currency } from "../plans/plans.catalog";

/** BILLING_ROUTES="IN:razorpay,*:dodo" maps a billing country to a provider, with * as the fallback. */
@Injectable()
export class ProviderRouter {
  constructor(private readonly config: ConfigService) {}

  private routes(): Map<string, string> {
    const map = new Map<string, string>();
    for (const entry of (this.config.get<string>("BILLING_ROUTES") ?? "").split(
      ",",
    )) {
      const [country, provider] = entry.split(":").map((s) => s.trim());
      if (country && provider)
        map.set(country.toUpperCase(), provider.toLowerCase());
    }
    return map;
  }

  providerFor(country?: string): string {
    const routes = this.routes();
    const provider =
      (country && routes.get(country.toUpperCase())) || routes.get("*");
    if (!provider)
      throw new BadRequestException("Billing isn't available in your region");
    return provider;
  }

  currencyFor(provider: string): Currency {
    return provider === "razorpay" ? "INR" : "USD";
  }

  /** Every routed provider must be enabled. */
  validate(enabled: string[]) {
    const routes = this.routes();
    if (!routes.size)
      throw new Error(
        'BILLING_ROUTES is empty, for example "IN:razorpay,*:dodo"',
      );
    for (const provider of routes.values()) {
      if (!enabled.includes(provider)) {
        throw new Error(
          `BILLING_ROUTES uses '${provider}', which isn't in BILLING_PROVIDERS`,
        );
      }
    }
  }
}
