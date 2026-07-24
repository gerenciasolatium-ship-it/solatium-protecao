import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extrairImeisDeTexto } from '../vistorias/vistoria-remota.util';
import { OcrImeiResultado, OcrProvider } from './interfaces';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * OCR do IMEI na foto do *#06# via Gemini (env GEMINI_API_KEY; modelo em
 * GEMINI_MODEL). Best-effort por contrato: qualquer erro/timeout retorna
 * `disponivel: false` — a vistoria nunca falha por causa do OCR.
 */
@Injectable()
export class GeminiOcrProvider implements OcrProvider {
  private readonly logger = new Logger(GeminiOcrProvider.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY') ?? '';
    this.model = config.get<string>('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  }

  async extrairImeis(fotoBase64Jpeg: string): Promise<OcrImeiResultado> {
    if (!this.apiKey) return { disponivel: false, imeis: [] };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const resposta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      'A imagem é a tela de um celular exibindo IMEI (discagem *#06#). ' +
                      'Liste TODOS os números de IMEI visíveis (sequências de 14 a 16 dígitos), ' +
                      'um por linha, apenas os dígitos. Se nenhum IMEI estiver legível, responda VAZIO.',
                  },
                  { inline_data: { mime_type: 'image/jpeg', data: fotoBase64Jpeg } },
                ],
              },
            ],
            generationConfig: { temperature: 0, maxOutputTokens: 200 },
          }),
        },
      ).finally(() => clearTimeout(timeout));
      if (!resposta.ok) {
        this.logger.warn(`OCR IMEI: Gemini respondeu HTTP ${resposta.status}`);
        return { disponivel: false, imeis: [] };
      }
      const json = (await resposta.json()) as GeminiResponse;
      const texto =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n') ?? '';
      return { disponivel: true, imeis: extrairImeisDeTexto(texto) };
    } catch (erro) {
      this.logger.warn(`OCR IMEI indisponível: ${erro}`);
      return { disponivel: false, imeis: [] };
    }
  }
}
