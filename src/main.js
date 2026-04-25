import fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttpApp } from './configure-app';

async function bootstrap() {
  const certPath = process.env.TLS_CERT_PATH?.trim();
  const keyPath = process.env.TLS_KEY_PATH?.trim();
  const httpsOptions =
    certPath && keyPath
      ? {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        }
      : undefined;

  const app = await NestFactory.create(
    AppModule,
    httpsOptions ? { httpsOptions } : undefined,
  );
  configureHttpApp(app);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: 'server_started',
      port: Number(port),
      tls: Boolean(httpsOptions),
      service: 'time-off-microservice',
    }),
  );
}
bootstrap();
