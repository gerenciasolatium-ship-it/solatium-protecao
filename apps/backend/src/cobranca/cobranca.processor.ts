import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContratosService } from '../contratos/contratos.service';
import {
  FILA_COBRANCA,
  JOB_INADIMPLENCIA,
  JOB_PIX_FALLBACK,
  PixFallbackJob,
} from './cobranca.const';
import { InadimplenciaService } from './inadimplencia.service';

export { FILA_COBRANCA, JOB_INADIMPLENCIA };

/**
 * Worker da fila de cobrança: régua diária de inadimplência (repetível) e
 * fallback "não perder venda" — Pix não pago no prazo vira boleto no WhatsApp.
 */
@Processor(FILA_COBRANCA)
export class CobrancaProcessor extends WorkerHost {
  private readonly logger = new Logger(CobrancaProcessor.name);

  constructor(
    private readonly inadimplencia: InadimplenciaService,
    private readonly contratos: ContratosService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name === JOB_INADIMPLENCIA) {
      this.logger.log('Rodando varredura diária de inadimplência…');
      return this.inadimplencia.executar();
    }
    if (job.name === JOB_PIX_FALLBACK) {
      return this.contratos.fallbackPixParaBoleto(job.data as PixFallbackJob);
    }
    this.logger.warn(`Job desconhecido na fila ${FILA_COBRANCA}: ${job.name}`);
    return null;
  }
}
