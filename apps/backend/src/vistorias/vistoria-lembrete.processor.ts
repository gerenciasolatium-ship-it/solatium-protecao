import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FILA_VISTORIA, JOB_LEMBRETE_VISTORIA, LembreteVistoriaJob } from './vistoria-remota.util';
import { VistoriasService } from './vistorias.service';

/** Worker da fila de vistoria: lembrete de link prestes a vencer (delayed job). */
@Processor(FILA_VISTORIA)
export class VistoriaLembreteProcessor extends WorkerHost {
  private readonly logger = new Logger(VistoriaLembreteProcessor.name);

  constructor(private readonly vistorias: VistoriasService) {
    super();
  }

  async process(job: Job<LembreteVistoriaJob>) {
    if (job.name === JOB_LEMBRETE_VISTORIA) {
      return this.vistorias.enviarLembrete(job.data);
    }
    this.logger.warn(`Job desconhecido na fila ${FILA_VISTORIA}: ${job.name}`);
    return null;
  }
}
