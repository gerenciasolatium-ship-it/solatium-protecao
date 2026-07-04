import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';

/**
 * Configura o Swagger em /docs.
 * Em produção protege com Basic Auth (SWAGGER_USER / SWAGGER_PASSWORD).
 */
export function setupSwagger(app: INestApplication, config: ConfigService) {
  const isProd = config.get('NODE_ENV') === 'production';

  if (isProd) {
    const user = config.get<string>('SWAGGER_USER');
    const pass = config.get<string>('SWAGGER_PASSWORD');
    app.use('/docs', (req: Request, res: Response, next: NextFunction) => {
      const header = req.headers.authorization ?? '';
      const [, encoded] = header.split(' ');
      const decoded = Buffer.from(encoded ?? '', 'base64').toString();
      const [u, p] = decoded.split(':');
      if (u === user && p === pass) return next();
      res.set('WWW-Authenticate', 'Basic realm="Solatium Docs"');
      res.status(401).send('Autenticação necessária.');
    });
  }

  const docConfig = new DocumentBuilder()
    .setTitle('Proteção Solatium API')
    .setDescription('API da plataforma de proteção de celular para lojas parceiras.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, docConfig);
  SwaggerModule.setup('docs', app, document);
}
