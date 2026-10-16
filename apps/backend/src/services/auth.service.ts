import { Injectable } from "@nestjs/common";
import { OrganizationService } from "@docgpt/nestjs-libraries/database/prisma/organizations/organization.service";
import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { UsersService } from "@docgpt/nestjs-libraries/database/prisma/users/users.service";

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
    addToOrg?: boolean | {},
  ) {
    const { email, password, company, provider } = body;
    
    if (provider === "LOCAL") {
      if (process.env.DISALLOW_PLUS && email.includes("+")) {
        throw new Error("Email with plus sign is not allowed");
      }

      const user = this._usersService.getUserByEmail(email);

      if (body instanceof CreateOrgUserDto) {
        if (user) {
          throw new Error("User already exists");
        }

        const create = await this._organizationService.createOrgAndUser(
          body,
          ip,
          userAgent,
        );
        console.log('create', create);
        const obj = {}

        //send email for activation

        return obj;
  
      }
    }
  }

  getOrgFromCookie(cookie: string){
     return false;
  }
}
