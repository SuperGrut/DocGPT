import { Injectable } from "@nestjs/common";
import { Provider } from "@prisma/client";
import { PrismaRepository } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import { AuthService } from "@docgpt/helpers/auth/auth.service";

@Injectable()
export class UsersRepository {
  constructor(private _user: PrismaRepository<"user">) {}

  getUserByEmail(email: string) {
    return this._user.model.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
        providerName: Provider.LOCAL,
        deletedAt: null,
      },
      // include: {
      //   picture: {
      //     select: {
      //       id: true,
      //       path: true,
      //     },
      //   },
      // },
    });
  }

  getUserById(id: string) {
    return this._user.model.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._user.model.user.findFirst({
      where: {
        providerId,
        providerName: provider,
        deletedAt: null,
      },
    });
  }

  updatePassword(id: string, password: string) {
    return this._user.model.user.update({
      where: {
        id,
        providerName: Provider.LOCAL,
      },
      data: {
        password: AuthService.hashPassword(password),
      },
    });
  }

  updateProfile(
    userId: string,
    profileData: {
      name?: string;
      lastName?: string;
      bio?: string;
      timezone?: number;
      pictureId?: string;
    },
  ) {
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: profileData,
    });
  }

  activateUser(id: string) {
    return this._user.model.user.update({
      where: {
        id,
      },
      data: {
        activated: true,
      },
    });
  }
}
