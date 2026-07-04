import { Logger, Module } from '@nestjs/common';
import {
  CobrancaInput,
  CobrancaResult,
  MensagemInput,
  MessagingProvider,
  PaymentProvider,
  StorageProvider,
  UploadInput,
  PAYMENT_PROVIDER,
  MESSAGING_PROVIDER,
  STORAGE_PROVIDER,
} from './interfaces';

const logger = new Logger('IntegrationsStub');

/** Stubs no-op: registram a intenção mas não chamam serviço externo (S2/S3). */
class StubPaymentProvider implements PaymentProvider {
  async criarCobranca(input: CobrancaInput): Promise<CobrancaResult> {
    logger.warn(`[stub] criarCobranca ignorada (Asaas entra na S3): R$ ${input.valor}`);
    return { provedorId: 'stub', status: 'NAO_IMPLEMENTADO' };
  }
}

class StubMessagingProvider implements MessagingProvider {
  async enviarWhatsapp(input: MensagemInput): Promise<{ enviado: boolean; id?: string }> {
    logger.warn(`[stub] enviarWhatsapp ignorada (Digisac entra na S3): ${input.template}`);
    return { enviado: false };
  }
}

class StubStorageProvider implements StorageProvider {
  async upload(input: UploadInput): Promise<{ url: string }> {
    logger.warn(`[stub] upload ignorado (R2 entra na S2): ${input.chave}`);
    return { url: `stub://${input.chave}` };
  }
  async urlAssinada(chave: string): Promise<string> {
    return `stub://${chave}`;
  }
}

@Module({
  providers: [
    { provide: PAYMENT_PROVIDER, useClass: StubPaymentProvider },
    { provide: MESSAGING_PROVIDER, useClass: StubMessagingProvider },
    { provide: STORAGE_PROVIDER, useClass: StubStorageProvider },
  ],
  exports: [PAYMENT_PROVIDER, MESSAGING_PROVIDER, STORAGE_PROVIDER],
})
export class IntegrationsModule {}
