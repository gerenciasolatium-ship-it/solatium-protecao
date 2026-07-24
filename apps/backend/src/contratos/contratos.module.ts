import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AparelhosModule } from '../aparelhos/aparelhos.module';
import { FILA_COBRANCA } from '../cobranca/cobranca.const';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';

@Module({
  imports: [
    // Mesma fila do CobrancaModule (registro duplicado é seguro no BullMQ):
    // o checkout agenda aqui o job de fallback Pix→boleto que o worker consome.
    BullModule.registerQueue({ name: FILA_COBRANCA }),
    IntegrationsModule,
    AparelhosModule,
  ],
  controllers: [ContratosController],
  providers: [ContratosService],
  exports: [ContratosService],
})
export class ContratosModule {}
