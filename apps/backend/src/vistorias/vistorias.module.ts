import { Module } from '@nestjs/common';
import { AparelhosModule } from '../aparelhos/aparelhos.module';
import { VistoriasController } from './vistorias.controller';
import { VistoriasService } from './vistorias.service';

@Module({
  imports: [AparelhosModule],
  controllers: [VistoriasController],
  providers: [VistoriasService],
  exports: [VistoriasService],
})
export class VistoriasModule {}
