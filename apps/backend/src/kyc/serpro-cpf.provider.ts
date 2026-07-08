import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nascimentoParaIso } from './kyc.util';

export interface CpfConsultado {
  nome: string;
  nascimento: string | null; // ISO YYYY-MM-DD
  situacao?: string; // ex.: "Regular"
}

/**
 * Provedor Serpro Consulta CPF (https://apicenter.estaleiro.serpro.gov.br).
 * Ativado pela env SERPRO_CONSULTA_CPF_TOKEN. Outros provedores (Assertiva,
 * Datavalid…) entram como classes irmãs atrás do mesmo CpfConsultado.
 */
@Injectable()
export class SerproCpfProvider {
  private readonly logger = new Logger(SerproCpfProvider.name);

  constructor(private readonly config: ConfigService) {}

  get configurado(): boolean {
    return Boolean(this.config.get<string>('SERPRO_CONSULTA_CPF_TOKEN'));
  }

  /** null = CPF não encontrado no provedor. Lança em erro de rede/serviço. */
  async consultar(cpf: string): Promise<CpfConsultado | null> {
    const base =
      this.config.get<string>('SERPRO_CONSULTA_CPF_URL') ??
      'https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v1/cpf';
    const token = this.config.get<string>('SERPRO_CONSULTA_CPF_TOKEN');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(`${base}/${cpf}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (resp.status === 404) return null;
      if (!resp.ok) {
        throw new Error(`Serpro respondeu ${resp.status}`);
      }
      const corpo = (await resp.json()) as {
        nome?: string;
        nascimento?: string;
        situacao?: { descricao?: string };
      };
      if (!corpo.nome) return null;
      return {
        nome: corpo.nome,
        nascimento: nascimentoParaIso(corpo.nascimento),
        situacao: corpo.situacao?.descricao,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
