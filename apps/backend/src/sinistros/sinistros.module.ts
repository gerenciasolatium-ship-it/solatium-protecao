import { Module } from '@nestjs/common';
import { SinistrosController, VouchersController } from './sinistros.controller';
import { SinistrosService } from './sinistros.service';

@Module({
  controllers: [SinistrosController, VouchersController],
  providers: [SinistrosService],
  exports: [SinistrosService],
})
export class SinistrosModule {}
