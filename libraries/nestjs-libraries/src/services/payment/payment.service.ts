@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: PaymentProviderRegistry,
  ) {}

  async createPayment(userId: string, planId: string) {
    // Load the plan and determine the amount on the backend.
    const plan = await this.getPlan(planId);

    // Select the configured provider.
    const providerName = this.getConfiguredProvider();
    const provider = this.providerRegistry.get(providerName);

    // Create a pending payment record.
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        provider: providerName,
        amount: plan.amount,
        currency: plan.currency,
        description: plan.name,
      },
    });

    // Create the payment with the external provider.
    const result = await provider.createPayment({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      description: payment.description ?? plan.name,
      customerEmail: await this.getUserEmail(userId),
      returnUrl: this.getReturnUrl(),
    });

    // Store provider's payment identifier.
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: result.providerPaymentId,
      },
    });

    return {
      paymentId: payment.id,
      checkoutUrl: result.checkoutUrl,
      clientSecret: result.clientSecret,
    };
  }

  // getPlan(), getConfiguredProvider(), getUserEmail(),
  // and getReturnUrl() are app-specific helpers.
}
