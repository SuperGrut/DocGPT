import { Injectable } from "@nestjs/common";
import { UsersRepository } from "@docgpt/nestjs-libraries/database/prisma/users/users.repository";

@Injectable()
export class UsersService {
  constructor(private _usersRepository: UsersRepository) {}

  getUserByEmail(email: string) {
    return this._usersRepository.getUserByEmail(email);
  }

  getUserById(id: string) {}
  
}
