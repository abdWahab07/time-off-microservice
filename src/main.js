import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttpApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureHttpApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: 'server_started',
      port: Number(port),
      service: 'time-off-microservice',
    }),
  );
}
bootstrap();
