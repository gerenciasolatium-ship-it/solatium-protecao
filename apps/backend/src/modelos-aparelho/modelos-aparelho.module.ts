import { Module } from '@nestjs/common';
import { ModelosAparelhoController } from './modelos-aparelho.controller';
import { ModelosAparelhoService } from './modelos-aparelho.service';

@Module({
  controllers: [ModelosAparelhoController],
  providers: [ModelosAparelhoService],
  exports: [ModelosAparelhoService],
})
export class ModelosAparelhoModule {}
