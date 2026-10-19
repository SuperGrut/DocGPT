import { Injectable } from "@nestjs/common";
import { OrganizationService } from "@docgpt/nestjs-libraries/database/prisma/organizations/organization.service";
import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { UsersService } from "@docgpt/nestjs-libraries/database/prisma/users/users.service";
import { AuthService as AuthChecker } from "@docgpt/helpers/auth/auth.service";
import { AuthProvidersManager } from "@docgpt/backend/services/auth/providers/providers.manager";
@Injectable()
export class AuthService {
  constructor(
    private _organizationService: OrganizationService,
    private _usersService: UsersService,
    private _providerManager: AuthProvidersManager,
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

      if (!user || !AuthChecker.comparePassword(body.password, user.password)) {
        throw new Error("Invalid user name or password");
      }

      if (!user.activated) {
        throw new Error("User is not activated");
      }

      return { addedOrg: false, jwt: await this.jwt(user) };
    }

    const user = await this.loginOrRegisterProvider(
      provider,
      body as CreateOrgUserDto,
      ip,
      userAgent,
    );
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

  private async loginOrRegisterWithProvider(
    provider: Provider,
    body: CreateOrgUserDto,
    ip: string,
    userAgent: string,
  ) {
    const providerInstance = this._providerManager.getProvider(provider);
    const providerUser = await providerInstance.getUser(body.providerToken);

    if (!providerUser) {
      throw new Error("Invalid provider token");
    }

    const user = await this._userService.getUserByProvider(
      providerUser.id,
      provider,
    );
    if (user) {
      return user;
    }

    const create = await this._organizationService.createOrgAndUser(
      {
        company: body.company,
        email: providerUser.email,
        password: "",
        provider,
        providerId: providerUser.id,
        datafast_visitor_id: body.datafast_visitor_id,
      },
      ip,
      userAgent,
    );

    try {
      if (providerInstance?.postRegistration) {
        await providerInstance.postRegistration(body.providerToken, create.id);
      }
    } catch (err) {
      // Don't fail registration if postRegistration fails
    }

    return create.users[0].user;
  }
}
