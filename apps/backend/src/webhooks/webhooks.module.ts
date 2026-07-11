import { Module } from '@nestjs/common';
import { CertificadosModule } from '../certificados/certificados.module';
import { CobrancaModule } from '../cobranca/cobranca.module';
import { AsaasWebhookController } from './asaas-webhook.controller';

@Module({
  imports: [CertificadosModule, CobrancaModule],
  controllers: [AsaasWebhookController],
})
export class WebhooksModule {}
