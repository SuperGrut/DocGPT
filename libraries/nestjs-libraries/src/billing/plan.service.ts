import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        amount: true,
        currency: true,
        interval: true,
        intervalCount: true,
        features: true,
        limits: true,
      },
      orderBy: { amount: "asc" },
    });
  }

  async getPlan(code: string) {
    const plan = await this.prisma.plan.findFirst({
      where: {
        code,
        isActive: true,
      },
      include: {
        providerPlans: true,
      },
    });

    if (!plan) {
      throw new NotFoundException("Plan not found");
    }

    return plan;
  }
}
