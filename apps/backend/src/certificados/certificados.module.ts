import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { BilhetePdfService } from './bilhete-pdf.service';
import { CertificadosController } from './certificados.controller';
import { EmissaoProcessor, FILA_EMISSAO } from './emissao.processor';
import { EmissaoService } from './emissao.service';
import { ValidarController } from './validar.controller';

@Module({
  imports: [
    IntegrationsModule,
    FinanceiroModule,
    BullModule.registerQueue({
      name: FILA_EMISSAO,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [CertificadosController, ValidarController],
  providers: [EmissaoService, EmissaoProcessor, BilhetePdfService],
  exports: [EmissaoService, BullModule],
})
export class CertificadosModule {}
