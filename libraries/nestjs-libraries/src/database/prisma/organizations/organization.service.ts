import { Injectable } from "@nestjs/common";
import { OrganizationRepository } from "@docgpt/nestjs-libraries/database/prisma/organizations/organization.repository";
import { CreateOrgUserDto } from "@docgpt/nestjs-libraries/dtos/auth/create.org.user.dtos";
import { Organization } from "@prisma/client";

@Injectable()
export class OrganizationService {
  constructor(private _organizationRepository: OrganizationRepository) {}

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, "providerToken" & { providerId?: string }>,
    ip: string,
    userAgent: string,
  ) {
    console.log("entered createOrgAndUser");
    return this._organizationRepository.createOrgAndUser(body, ip, userAgent);
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: "ADMIN" | "USER",
  ) {
    return this._organizationRepository.addUserToOrg(userId, id, orgId, role);
  }

  getOrgById(id: string) {
    return this._organizationRepository.getOrgById(id);
  }

  getUserOrg(id: string) {
    return this._organizationRepository.getUserOrg(id);
  }

  updateOrganization(
    organizationId: string,
    organizationData: {
      name?: string;
      description?: string | null;
      allowTrial?: boolean;
      isTrailing?: boolean;
    },
  ) {
    return this._organizationRepository.updateOrganization(
      organizationId,
      organizationData,
    );
  }

  async deleteTeamMember(org: Organization, userId: string) {
    const userOrgs = await this._organizationRepository.getOrgsByUserId(userId);
    const findOrgToDelete = userOrgs.find((orgUser) => orgUser.id === org.id);
    if (!findOrgToDelete) {
      throw new Error("User is not part of this organization");
    }

    // @ts-ignore
    const myRole = org.users[0].role;
    const userRole = findOrgToDelete.users[0].role;
    const myLevel = myRole === "USER" ? 0 : myRole === "ADMIN" ? 1 : 2;
    const userLevel = userRole === "USER" ? 0 : userRole === "ADMIN" ? 1 : 2;

    if (myLevel < userLevel) {
      throw new Error("You do not have permission to delete this user");
    }

    return this._organizationRepository.deleteTeamMember(org.id, userId);
  }
}
