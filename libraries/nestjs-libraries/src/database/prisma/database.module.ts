import { Module } from "@nestjs/common";
import {
  PrismaService,
  PrismaRepository,
  PrismaTransaction,
} from "@docgpt/nestjs-libraries/database/prisma/prisma.service";

@Module({
  imports: [],
  controllers: [],
  providers: [PrismaService, PrismaRepository, PrismaTransaction],
  exports: [PrismaService, PrismaRepository, PrismaTransaction],
})
export class DatabaseModule {}
