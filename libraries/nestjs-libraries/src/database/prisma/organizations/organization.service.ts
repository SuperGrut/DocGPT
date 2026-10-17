import { Injectable } from "@nestjs/common";
import { OrganizationRepository } from "@docgpt/nestjs-libraries/database/prisma/organizations/organization.repository";
import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";

@Injectable()
export class OrganizationService {
  constructor(private _organizationRepository: OrganizationRepository) {}

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, "providerToken" & { providerId?: string }>,
    ip: string,
    userAgent: string,
  ) {
    console.log('entered createOrgAndUser');
    return this._organizationRepository.createOrgAndUser(body, ip, userAgent);
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: 'ADMIN' | 'USER'
  ){
    return this._organizationRepository.addUserToOrg(userId, id, orgId, role);
  }
}
