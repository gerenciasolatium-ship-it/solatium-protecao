import { Module } from '@nestjs/common';
import { AparelhosController } from './aparelhos.controller';
import { AparelhosService } from './aparelhos.service';

@Module({
  controllers: [AparelhosController],
  providers: [AparelhosService],
  exports: [AparelhosService],
})
export class AparelhosModule {}
