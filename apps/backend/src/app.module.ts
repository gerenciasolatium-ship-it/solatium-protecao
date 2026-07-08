import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { LojasModule } from './lojas/lojas.module';
import { VendedoresModule } from './vendedores/vendedores.module';
import { ClientesModule } from './clientes/clientes.module';
import { AparelhosModule } from './aparelhos/aparelhos.module';
import { PlanosModule } from './planos/planos.module';
import { ModelosAparelhoModule } from './modelos-aparelho/modelos-aparelho.module';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { VistoriasModule } from './vistorias/vistorias.module';
import { ContratosModule } from './contratos/contratos.module';
import { CertificadosModule } from './certificados/certificados.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ParceirosApiModule } from './parceiros-api/parceiros-api.module';
import { KycModule } from './kyc/kyc.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    // Fila da emissão automática (M3). maxRetriesPerRequest: null é requisito do BullMQ.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
      }),
    }),
    PrismaModule,
    IntegrationsModule,
    AuthModule,
    UsuariosModule,
    LojasModule,
    VendedoresModule,
    ClientesModule,
    AparelhosModule,
    PlanosModule,
    ModelosAparelhoModule,
    FinanceiroModule,
    VistoriasModule,
    ContratosModule,
    CertificadosModule,
    WebhooksModule,
    ParceirosApiModule,
    KycModule,
    HealthModule,
  ],
  providers: [
    // JWT global (rotas @Public são liberadas), papéis via @Roles, auditoria de mutações.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
