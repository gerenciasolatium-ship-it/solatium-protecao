import { Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';

@Module({
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
  // Exportado para que a emissão (M3) e o cancelamento (M5) registrem comissões/clawbacks.
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
