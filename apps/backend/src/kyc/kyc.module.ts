import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { SerproCpfProvider } from './serpro-cpf.provider';

@Module({
  controllers: [KycController],
  providers: [KycService, SerproCpfProvider],
})
export class KycModule {}
