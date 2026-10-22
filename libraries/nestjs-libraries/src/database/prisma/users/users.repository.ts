import { Injectable } from "@nestjs/common";
import { Provider } from "@prisma/client";
import { PrismaRepository } from "@docgpt/nestjs-libraries/database/prisma/prisma.service";
import { AuthService } from "@docgpt/helpers/auth/auth.service";

@Injectable()
export class UsersRepository {
  constructor(private _user: PrismaRepository<"user">) {}

  async getUserByEmail(email: string) {
    return await this._user.model.user.findFirst({
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
