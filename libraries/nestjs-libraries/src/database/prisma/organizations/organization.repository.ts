import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { Injectable } from "@nestjs/common";
import { PrismaRepository } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import { AuthService } from "@docgpt/helpers/auth/auth.service";
import { makeSecureId } from "@docgpt/nestjs-libraries/services/make.secure.id";
@Injectable()
export class OrganizationRepository {
  constructor(
    private _organization: PrismaRepository<"organization">,
    private _users: PrismaRepository<'user'>
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
            role: "SuperAdmin",    // update it later
            user: {
              create: {
                activated: body.provider !== "LOCAL",      // update it later
                email: body.email,
                password: body.password
                  ? AuthService.hashPassword(body.password)
                  : "",
                providerName: body.provider,
                providerId: "",                 // update it later

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
}
