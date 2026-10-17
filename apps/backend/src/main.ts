import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { Logger, ValidationPipe } from "@nestjs/common";

const PORT = process.env.PORT || 3000;

async function start() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    })
  );

  try {
    (app).listen(PORT);
    console.log('App started')
    Logger.log(`Backend started on: http://localhost:${PORT}`);
  } catch (e) {
    Logger.error(`Backend failed to start on port ${PORT} `, e);
  }
}
start();
