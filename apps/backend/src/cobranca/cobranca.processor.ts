import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InadimplenciaService } from './inadimplencia.service';

export const FILA_COBRANCA = 'cobranca';
export const JOB_INADIMPLENCIA = 'verificar-inadimplencia';

/** Worker da régua de inadimplência (job diário repetível — ver CobrancaModule). */
@Processor(FILA_COBRANCA)
export class CobrancaProcessor extends WorkerHost {
  private readonly logger = new Logger(CobrancaProcessor.name);

  constructor(private readonly inadimplencia: InadimplenciaService) {
    super();
  }

  async process(job: Job) {
    if (job.name === JOB_INADIMPLENCIA) {
      this.logger.log('Rodando varredura diária de inadimplência…');
      return this.inadimplencia.executar();
    }
    this.logger.warn(`Job desconhecido na fila ${FILA_COBRANCA}: ${job.name}`);
    return null;
  }
}
