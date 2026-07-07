import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmissaoService } from './emissao.service';

export const FILA_EMISSAO = 'emissao';

export interface EmitirCertificadoJob {
  contratoId: string;
}

/**
 * Worker da emissão automática (roda no mesmo processo do backend).
 * Retry: 5 tentativas com backoff exponencial (config na fila).
 */
@Processor(FILA_EMISSAO)
export class EmissaoProcessor extends WorkerHost {
  private readonly logger = new Logger(EmissaoProcessor.name);

  constructor(private readonly emissao: EmissaoService) {
    super();
  }

  async process(job: Job<EmitirCertificadoJob>) {
    this.logger.log(`Job emitir-certificado contrato=${job.data.contratoId} tentativa=${job.attemptsMade + 1}`);
    return this.emissao.emitirParaContrato(job.data.contratoId);
  }
}
