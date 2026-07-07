import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasProvider } from './asaas.provider';
import { DigisacProvider } from './digisac.provider';
import { R2Provider } from './r2.provider';
import { ResendProvider } from './resend.provider';
import {
  CobrancaInput,
  CobrancaResult,
  EmailInput,
  EmailProvider,
  MensagemInput,
  MessagingProvider,
  PaymentProvider,
  StorageProvider,
  UploadInput,
  EMAIL_PROVIDER,
  MESSAGING_PROVIDER,
  PAYMENT_PROVIDER,
  STORAGE_PROVIDER,
} from './interfaces';

const logger = new Logger('Integrations');

/** Stubs no-op para ambiente sem as envs da integração (dev/CI). */
class StubPaymentProvider implements PaymentProvider {
  async criarCliente(): Promise<{ customerId: string }> {
    logger.warn('[stub] criarCliente ignorado (ASAAS_API_KEY ausente)');
    return { customerId: 'stub' };
  }
  async criarCobranca(input: CobrancaInput): Promise<CobrancaResult> {
    logger.warn(`[stub] criarCobranca ignorada (ASAAS_API_KEY ausente): R$ ${input.valor}`);
    return { provedorId: 'stub', status: 'NAO_IMPLEMENTADO' };
  }
}

class StubMessagingProvider implements MessagingProvider {
  async enviarWhatsapp(input: MensagemInput): Promise<{ enviado: boolean; id?: string }> {
    logger.warn(`[stub] enviarWhatsapp ignorado (DIGISAC_TOKEN ausente) p/ ${input.telefone}`);
    return { enviado: false };
  }
}

class StubEmailProvider implements EmailProvider {
  async enviarEmail(input: EmailInput): Promise<{ enviado: boolean; id?: string }> {
    logger.warn(`[stub] enviarEmail ignorado (RESEND_API_KEY ausente) p/ ${input.para}`);
    return { enviado: false };
  }
}

class StubStorageProvider implements StorageProvider {
  async upload(input: UploadInput): Promise<{ url: string }> {
    logger.warn(`[stub] upload ignorado (R2_ACCESS_KEY ausente): ${input.chave}`);
    return { url: `stub://${input.chave}` };
  }
  async urlAssinada(chave: string): Promise<string> {
    return `stub://${chave}`;
  }
}

@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('ASAAS_API_KEY') ? new AsaasProvider(config) : new StubPaymentProvider(),
    },
    {
      provide: MESSAGING_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('DIGISAC_TOKEN') ? new DigisacProvider(config) : new StubMessagingProvider(),
    },
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('RESEND_API_KEY') ? new ResendProvider(config) : new StubEmailProvider(),
    },
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('R2_ACCESS_KEY') ? new R2Provider(config) : new StubStorageProvider(),
    },
  ],
  exports: [PAYMENT_PROVIDER, MESSAGING_PROVIDER, EMAIL_PROVIDER, STORAGE_PROVIDER],
})
export class IntegrationsModule {}
