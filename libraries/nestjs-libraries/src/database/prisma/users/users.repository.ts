import { Injectable } from "@nestjs/common";

@Injectable()
export class UsersRepository {
  getUserByEmail(email: string) {
    return {
      email: "akashsah@gmail.com",
      company: "SuperGrut",
      org: "Gord Motors",
    };
  }
}
