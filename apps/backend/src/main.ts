import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', { exclude: ['health', 'validar/:codigo'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const origins = [
    config.get<string>('APP_LOJA_URL') ?? 'http://localhost:5173',
    config.get<string>('APP_ADMIN_URL') ?? 'http://localhost:5174',
  ];
  app.enableCors({ origin: origins, credentials: true });

  setupSwagger(app, config);

  const port = Number(config.get('PORT') ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🛡️  Proteção Solatium API rodando em http://localhost:${port}`);
}

// Fecha o processo em falha de bootstrap (Railway reinicia)
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao subir a API:', err);
  process.exit(1);
});
