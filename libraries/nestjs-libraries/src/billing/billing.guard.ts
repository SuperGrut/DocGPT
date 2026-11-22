import { CanActivate, Injectable, NotFoundException } from "@nestjs/common";

import { EntitlementsService } from "./entitlements/entitlements.service";

/** With billing off (self-hosted), the billing and webhook routes simply don't exist. */
@Injectable()
export class BillingEnabledGuard implements CanActivate {
  constructor(private readonly entitlements: EntitlementsService) {}

  canActivate(): boolean {
    if (!this.entitlements.enabled) throw new NotFoundException();
    return true;
  }
}
