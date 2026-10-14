import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { Injectable } from "@nestjs/common";

@Injectable()
export class OrganizationRepository {
  constructor() {}

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, "providerToken" & { providerId?: string }>,
    ip: string,
    userAgent: string,
  ) {
    return {};
  }
}
