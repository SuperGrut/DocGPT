import { Injectable } from "@nestjs/common";
import { OrganizationService } from "@docgpt/nestjs-libraries/database/prisma/organizations/organization.service";
import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { UsersService } from "@docgpt/nestjs-libraries/database/prisma/users/users.service";
import { AuthService as AuthChecker } from "@docgpt/helpers/auth/auth.service";
@Injectable()
export class AuthService {
  constructor(
    private _organizationService: OrganizationService,
    private _usersService: UsersService,
  ) {}

  async routeAuth(
    body: CreateOrgUserDto,
    ip: string,
    userAgent: string,
    addToOrg?: boolean | { id: string; orgId: string; role: "USER" | "ADMIN" },
  ) {
    const { email, password, company, provider } = body;

    if (provider === "LOCAL") {
      if (process.env.DISALLOW_PLUS && email.includes("+")) {
        throw new Error("Email with plus sign is not allowed");
      }

      const user = await this._usersService.getUserByEmail(email);

      if (body instanceof CreateOrgUserDto) {
        console.log("enter instanceOF block");
        if (user) {
          throw new Error("User already exists");
        }

        const createdOrgAndUser =
          await this._organizationService.createOrgAndUser(body, ip, userAgent);

        const addedToOrg =
          addToOrg && typeof addToOrg !== "boolean"
            ? await this._organizationService.addUserToOrg(
                createdOrgAndUser.users[0].user.id,
                addToOrg.id,
                addToOrg.orgId,
                addToOrg.role,
              )
            : false;

        const obj = {
          addedToOrg,
          jwt: await this.jwt(createdOrgAndUser.users[0].user),
        };
        // await this._emailService.sendEmailSync(
        //   body.email,
        //   "Activate your account",
        //   `Click <a href="${process.env.FRONTEND_URL}/auth/activate/${obj.jwt}">here</a> to activate your account`,
        // );
        return obj;
      }
    }
  }

  getOrgFromCookie(cookie: string) {
    return false;
  }

  private async jwt(user: User) {
    if (user.password) {
      delete user.password;
    }
    return AuthChecker.signJWT(user);
  }
}
