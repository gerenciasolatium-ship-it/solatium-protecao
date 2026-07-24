import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AparelhosModule } from '../aparelhos/aparelhos.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { VistoriaLembreteProcessor } from './vistoria-lembrete.processor';
import { FILA_VISTORIA } from './vistoria-remota.util';
import { VistoriaRemotaController } from './vistoria-remota.controller';
import { VistoriasController } from './vistorias.controller';
import { VistoriasService } from './vistorias.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: FILA_VISTORIA,
      defaultJobOptions: { attempts: 2, removeOnComplete: 100, removeOnFail: 100 },
    }),
    AparelhosModule,
    IntegrationsModule,
  ],
  controllers: [VistoriasController, VistoriaRemotaController],
  providers: [VistoriasService, VistoriaLembreteProcessor],
  exports: [VistoriasService],
})
export class VistoriasModule {}
