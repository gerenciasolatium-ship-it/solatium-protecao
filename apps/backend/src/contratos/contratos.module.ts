import { Module } from '@nestjs/common';
import { AparelhosModule } from '../aparelhos/aparelhos.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';

@Module({
  imports: [IntegrationsModule, AparelhosModule],
  controllers: [ContratosController],
  providers: [ContratosService],
  exports: [ContratosService],
})
export class ContratosModule {}
