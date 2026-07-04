import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * E2E do fluxo de autenticação e proteção por papel.
 * Requer um Postgres acessível via DATABASE_URL (o CI sobe um service container).
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const admin = { email: 'e2e-admin@solatium.com.br', senha: 'Solatium@123' };
  const vendedor = { email: 'e2e-vendedor@solatium.com.br', senha: 'Loja@123' };
  let lojaId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // Massa de teste isolada.
    await limpar();
    const loja = await prisma.loja.create({
      data: { nome: 'Loja E2E', cnpj: '99888777000166' },
    });
    lojaId = loja.id;

    await prisma.usuario.create({
      data: {
        nome: 'Admin E2E',
        email: admin.email,
        senhaHash: await argon2.hash(admin.senha),
        role: 'ADMIN',
      },
    });
    await prisma.usuario.create({
      data: {
        nome: 'Vendedor E2E',
        email: vendedor.email,
        senhaHash: await argon2.hash(vendedor.senha),
        role: 'LOJA_VENDEDOR',
        lojaId,
      },
    });
  });

  afterAll(async () => {
    await limpar();
    await app.close();
  });

  async function limpar() {
    await prisma.usuario.deleteMany({
      where: { email: { in: [admin.email, vendedor.email] } },
    });
    await prisma.loja.deleteMany({ where: { cnpj: '99888777000166' } });
  }

  it('rejeita login com senha errada (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: admin.email, senha: 'errada' })
      .expect(401);
  });

  it('rejeita payload inválido (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nao-email', senha: '123' })
      .expect(400);
  });

  it('faz login do admin e retorna tokens + usuário', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send(admin).expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.usuario.role).toBe('ADMIN');
  });

  it('acessa /auth/me com token válido', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(admin);
    const token = login.body.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.email).toBe(admin.email);
  });

  it('bloqueia rota sem token (401)', async () => {
    await request(app.getHttpServer()).get('/api/usuarios').expect(401);
  });

  it('vendedor NÃO acessa rota de admin (/usuarios) — 403', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(vendedor);
    const token = login.body.accessToken;
    await request(app.getHttpServer())
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('admin acessa rota de admin (/usuarios) — 200', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(admin);
    const token = login.body.accessToken;
    await request(app.getHttpServer())
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('renova tokens via refresh', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send(admin);
    const res = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
  });
});
