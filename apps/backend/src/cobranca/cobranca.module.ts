import { InjectQueue, BullModule } from '@nestjs/bullmq';
import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ContratosModule } from '../contratos/contratos.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { FILA_COBRANCA, JOB_INADIMPLENCIA } from './cobranca.const';
import { CobrancaProcessor } from './cobranca.processor';
import { InadimplenciaService } from './inadimplencia.service';

/**
 * Régua de inadimplência (M5-lite): job repetível diário às 06:00 UTC
 * (03:00 Brasília) — suspende D+15, cancela D+30 com clawback.
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: FILA_COBRANCA,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    }),
    FinanceiroModule,
    IntegrationsModule,
    ContratosModule,
  ],
  providers: [InadimplenciaService, CobrancaProcessor],
  exports: [InadimplenciaService],
})
export class CobrancaModule implements OnModuleInit {
  private readonly logger = new Logger(CobrancaModule.name);

  constructor(@InjectQueue(FILA_COBRANCA) private readonly fila: Queue) {}

  async onModuleInit() {
    // jobId fixo: re-deploys não acumulam agendamentos duplicados.
    await this.fila.add(
      JOB_INADIMPLENCIA,
      {},
      { repeat: { pattern: '0 6 * * *' }, jobId: 'inadimplencia-diaria' },
    );
    this.logger.log('Job diário de inadimplência agendado (06:00 UTC / 03:00 BRT).');
  }
}
