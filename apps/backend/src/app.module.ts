import { Module } from '@nestjs/common';
import {DatabaseModule} from "@docgpt/nestjs-libraries/database/prisma/database.module"

@Module({
  imports: [DatabaseModule],
  controllers: [],
  providers: [],
  exports: [DatabaseModule]
})
export class AppModule {}
