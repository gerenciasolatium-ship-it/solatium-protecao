import { Module } from '@nestjs/common';
import { AparelhosModule } from '../aparelhos/aparelhos.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { VistoriaRemotaController } from './vistoria-remota.controller';
import { VistoriasController } from './vistorias.controller';
import { VistoriasService } from './vistorias.service';

@Module({
  imports: [AparelhosModule, IntegrationsModule],
  controllers: [VistoriasController, VistoriaRemotaController],
  providers: [VistoriasService],
  exports: [VistoriasService],
})
export class VistoriasModule {}
