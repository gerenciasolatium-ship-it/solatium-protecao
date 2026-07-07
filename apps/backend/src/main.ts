import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // Checagem antecipada: sem DATABASE_URL o Prisma quebra no onModuleInit com um
  // stack trace críptico (P1012). Falha aqui com mensagem acionável.
  if (!process.env.DATABASE_URL) {
    // eslint-disable-next-line no-console
    console.error(
      '❌ DATABASE_URL não configurada. Defina a variável de ambiente com a URL do Postgres ' +
        '(no Railway: adicione o plugin PostgreSQL e referencie ${{Postgres.DATABASE_URL}} nas ' +
        'Variables do serviço; local: copie .env.example para .env). A API não sobe sem ela.',
    );
    process.exit(1);
  }

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
