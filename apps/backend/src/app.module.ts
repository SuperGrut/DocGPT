import { Module } from "@nestjs/common";
import { DatabaseModule } from "@docgpt/nestjs-libraries/database/prisma/database.module";
import { AuthController } from "@docgpt/backend/api/routes/auth.controller";
import { AuthService } from "@docgpt/backend/services/auth.service";
import { OrganizationService } from "@docgpt/nestjs-libraries/database/prisma/organizations/organization.service";
import { OrganizationRepository } from "@docgpt/nestjs-libraries/database/prisma/organizations/organization.repository";
import { UsersService } from "@docgpt/nestjs-libraries/database/prisma/users/users.service";
import { UsersRepository } from "@docgpt/nestjs-libraries/database/prisma/users/users.repository";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    OrganizationService,
    OrganizationRepository,
    UsersService,
    UsersRepository,
  ],
  exports: [DatabaseModule],
})
export class AppModule {}
