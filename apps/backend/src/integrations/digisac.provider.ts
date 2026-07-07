import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MensagemInput, MessagingProvider } from './interfaces';

/**
 * Digisac: POST /messages com token estático (Bearer). Mesmo contrato do
 * cliente Python do solatium-backend (number + serviceId + file.base64).
 * Envio nunca lança: entrega de WhatsApp não pode derrubar a emissão (M3).
 */
@Injectable()
export class DigisacProvider implements MessagingProvider {
  private readonly logger = new Logger(DigisacProvider.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly serviceId: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('DIGISAC_URL') ?? '').replace(/\/$/, '');
    this.token = config.get<string>('DIGISAC_TOKEN') ?? '';
    this.serviceId = config.get<string>('DIGISAC_SERVICE_ID') ?? '';
  }

  async enviarWhatsapp(input: MensagemInput): Promise<{ enviado: boolean; id?: string }> {
    const numero = input.telefone.replace(/\D/g, '');
    const payload: Record<string, unknown> = {
      number: numero.startsWith('55') ? numero : `55${numero}`,
      text: input.texto,
      serviceId: this.serviceId,
      type: 'chat',
      origin: 'bot',
    };
    if (input.anexo) {
      payload.file = {
        base64: input.anexo.base64,
        name: input.anexo.nome,
        mimetype: input.anexo.contentType,
      };
    }

    try {
      const resposta = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify(payload),
      });
      const json = (await resposta.json().catch(() => ({}))) as { id?: string };
      if (!resposta.ok) {
        this.logger.error(`Digisac /messages → ${resposta.status}: ${JSON.stringify(json)}`);
        return { enviado: false };
      }
      return { enviado: true, id: json.id };
    } catch (erro) {
      this.logger.error(`Digisac indisponível: ${erro instanceof Error ? erro.message : erro}`);
      return { enviado: false };
    }
  }
}
