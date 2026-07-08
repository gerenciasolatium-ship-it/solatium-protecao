import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isCpfValido, normalizarCpf } from '../common/validators/cpf.util';
import { PrismaService } from '../prisma/prisma.service';
import { mascararCpfAuditoria } from './kyc.util';
import { SerproCpfProvider } from './serpro-cpf.provider';

/**
 * Consulta externa de CPF (KYC) para autopreencher o cadastro no balcão.
 * LGPD: toda consulta é gravada no audit_log com CPF mascarado, usuário e
 * resultado — base legal: execução de contrato/procedimentos preliminares
 * (art. 7º V) no fluxo de venda da proteção.
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serpro: SerproCpfProvider,
  ) {}

  async consultarCpf(cpfBruto: string, usuarioId: string | null, ip?: string) {
    const cpf = normalizarCpf(cpfBruto);
    if (!isCpfValido(cpf)) throw new BadRequestException('CPF inválido.');
    if (!this.serpro.configurado) {
      throw new NotImplementedException(
        'Consulta externa de CPF não configurada (SERPRO_CONSULTA_CPF_TOKEN).',
      );
    }

    let resultado: Awaited<ReturnType<SerproCpfProvider['consultar']>> = null;
    let erro: string | null = null;
    try {
      resultado = await this.serpro.consultar(cpf);
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }

    // Trilha LGPD — grava SEMPRE (achou, não achou ou falhou), com CPF mascarado.
    await this.prisma.auditLog
      .create({
        data: {
          usuarioId,
          acao: 'CONSULTA',
          entidade: 'kyc_cpf',
          entidadeId: mascararCpfAuditoria(cpf),
          depois: { provedor: 'serpro', encontrado: Boolean(resultado), erro },
          ip: ip ?? null,
        },
      })
      .catch((e) => this.logger.error(`Falha ao gravar audit_log da consulta CPF: ${e.message}`));

    if (erro) {
      this.logger.warn(`Consulta CPF ${mascararCpfAuditoria(cpf)} falhou: ${erro}`);
      throw new ServiceUnavailableException('Serviço de consulta de CPF indisponível.');
    }
    if (!resultado) throw new NotFoundException('CPF não encontrado no provedor.');
    return resultado;
  }
}
