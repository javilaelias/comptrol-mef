import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './config/env';
import { createRequestLoggerMiddleware } from './common/middleware/request-logger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  const config = app.get(ConfigService);
  app.use(createRequestLoggerMiddleware({ enabled: config.get('REQUEST_LOG_ENABLED') }));
  const corsOrigins = parseCorsOrigins(String(config.get('CORS_ORIGINS') ?? ''));
  const allowAllOrigins = corsOrigins.includes('*');

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowAllOrigins) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    // Para que la web lea el nombre del archivo en las descargas (exportaciones a Excel).
    exposedHeaders: ['Content-Disposition'],
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(Number(process.env.PORT ?? 3001));
}
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
