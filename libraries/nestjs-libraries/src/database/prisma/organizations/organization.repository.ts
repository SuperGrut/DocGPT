import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { Injectable } from "@nestjs/common";
import { PrismaRepository } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import { AuthService } from "@docgpt/helpers/auth/auth.service";
import { makeSecureId } from "@docgpt/nestjs-libraries/services/make.secure.id";
@Injectable()
export class OrganizationRepository {
  constructor(
    private _organization: PrismaRepository<"organization">,
    private _userOrg: PrismaRepository<"userOrganization">,
    private _user: PrismaRepository<"user">,
  ) {}

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, "providerToken" & { providerId?: string }>,
    ip: string,
    userAgent: string,
  ) {
    return this._organization.model.organization.create({
      data: {
        name: body.company,
        apiKey: AuthService.fixedEncryption(makeSecureId(20)),
        allowTrial: true,
        isTrailing: true,
        users: {
          create: {
            role: "SUPERADMIN", // update it later
            user: {
              create: {
                activated: body.provider !== "LOCAL", // update it later
                email: body.email,
                password: body.password
                  ? AuthService.hashPassword(body.password)
                  : "",
                providerName: body.provider,
                providerId: "", // update it later

                timezone: 0,
                ip,
                agent: userAgent,
              },
            },
          },
        },
      },
      select: {
        id: true,
        users: {
          select: {
            user: true,
          },
        },
      },
    });
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: "USER" | "ADMIN",
  ) {
    const checkIfInviteExists = await this._user.model.user.findFirst({
      where: {
        inviteId: id,
      },
    });

    if (checkIfInviteExists) {
      return false;
    }

    const checkForSubscription =
      await this._organization.model.organization.findFirst({
        where: {
          id: orgId,
        },
        select: {
          subscription: true,
        },
      });

    // if (
    //   process.env.STRIPE_PUBLISHABLE_KEY &&
    //   checkForSubscription?.subscription?.subscriptionTier ===
    //     SubscriptionTier.STANDARD
    // ) {
    //   return false;
    // }

    const create = await this._userOrg.model.userOrganization.create({
      data: {
        role,
        userId,
        organizationId: orgId,
      },
    });

    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        inviteId: id,
      },
    });

    return create;
  }

  getOrgById(id: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id,
      },
    });
  }

  getUserOrg(id: string) {
    return this._userOrg.model.userOrganization.findFirst({
      where: {
        id,
      },
      select: {
        user: true,
        organization: {
          include: {
            users: {
              select: {
                id: true,
                disabled: true,
                role: true,
                userId: true,
              },
            },
            subscription: {
              select: {
                subscriptionTier: true,
                totalChannels: true,
                isLifetime: true,
              },
            },
          },
        },
      },
    });
  }

  async updateOrganization(
    organizationId: string,
    organizationData: {
      name?: string;
      description?: string | null;
      allowTrial?: boolean;
      isTrailing?: boolean;
    },
  ) {
    return this._organization.model.organization.update({
      where: {
        id: organizationId,
      },
      data: organizationData,
    });
  }

  async deleteTeamMember(orgId: string, userId: string) {
    return this._userOrg.model.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });
  }
}
