import { Module } from '@nestjs/common';
import { CertificadosModule } from '../certificados/certificados.module';
import { AsaasWebhookController } from './asaas-webhook.controller';

@Module({
  imports: [CertificadosModule],
  controllers: [AsaasWebhookController],
})
export class WebhooksModule {}
