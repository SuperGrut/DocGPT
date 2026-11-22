import { Global, Module } from "@nestjs/common";

import { BillingController } from "./billing.controller";
import { BillingEnabledGuard } from "./billing.guard";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";
import { EntitlementsService } from "./entitlements/entitlements.service";
import { PricesService } from "./plans/prices.service";
import { DodoProvider } from "./providers/dodo.provider";
import { PaymentProviderManager } from "./providers/payment-provider.manager";
import { RazorpayProvider } from "./providers/razorpay.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { BillingReconciler } from "./reconciliation/billing-reconciler.service";
import { ProviderRouter } from "./routing/provider-router";
import { SubscriptionSyncService } from "./webhooks/subscription-sync.service";
import { WebhooksController } from "./webhooks/webhooks.controller";
import { WebhooksService } from "./webhooks/webhooks.service";

// Global so Document, Chat and the loader can inject EntitlementsService without importing this module.
// Import it in the Temporal worker app as well, since the loader uses it. With BILLING_ENABLED unset
// the module still loads, but the routes 404 and entitlements report "unlimited".
@Global()
@Module({
  controllers: [BillingController, WebhooksController],
  providers: [
    BillingRepository,
    EntitlementsService,
    PricesService,
    ProviderRouter,
    PaymentProviderManager,
    StripeProvider, // importing the classes is what runs their @BillingProvider decorators
    RazorpayProvider,
    DodoProvider,
    SubscriptionSyncService,
    WebhooksService,
    BillingService,
    BillingReconciler,
    BillingEnabledGuard,
  ],
  exports: [EntitlementsService, BillingService, BillingReconciler],
})
export class BillingModule {}
