import { Module } from '@nestjs/common';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [FinanceiroModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
