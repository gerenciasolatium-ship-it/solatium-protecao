import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailInput, EmailProvider } from './interfaces';

/** Resend via REST. Como no WhatsApp, falha de email não derruba a emissão. */
@Injectable()
export class ResendProvider implements EmailProvider {
  private readonly logger = new Logger(ResendProvider.name);
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY') ?? '';
    this.from =
      config.get<string>('RESEND_FROM') ?? 'Proteção Solatium <protecao@solatiumseguros.com>';
  }

  async enviarEmail(input: EmailInput): Promise<{ enviado: boolean; id?: string }> {
    try {
      const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          from: this.from,
          to: [input.para],
          subject: input.assunto,
          html: input.html,
          attachments: input.anexos?.map((a) => ({
            filename: a.nome,
            content: a.base64,
            content_type: a.contentType,
          })),
        }),
      });
      const json = (await resposta.json().catch(() => ({}))) as { id?: string };
      if (!resposta.ok) {
        this.logger.error(`Resend → ${resposta.status}: ${JSON.stringify(json)}`);
        return { enviado: false };
      }
      return { enviado: true, id: json.id };
    } catch (erro) {
      this.logger.error(`Resend indisponível: ${erro instanceof Error ? erro.message : erro}`);
      return { enviado: false };
    }
  }
}
