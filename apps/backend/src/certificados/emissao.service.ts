import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceiroService } from '../financeiro/financeiro.service';
import {
  EMAIL_PROVIDER,
  EmailProvider,
  MESSAGING_PROVIDER,
  MessagingProvider,
  STORAGE_PROVIDER,
  StorageProvider,
} from '../integrations/interfaces';
import { BilhetePdfService, BilheteDados } from './bilhete-pdf.service';
import {
  RodapeLegal,
  calcularVigencia,
  formatarDataBr,
  formatarNumeroCertificado,
} from './bilhete.util';

type ContratoCompleto = Prisma.ContratoGetPayload<{
  include: {
    cliente: true;
    aparelho: true;
    plano: true;
    loja: true;
    vendedor: true;
    vistoria: true;
    certificado: true;
    pagamentos: true;
  };
}>;

const FORMA_LABEL: Record<string, string> = {
  PIX: 'Pix (anual à vista)',
  CARTAO_RECORRENTE: 'Cartão de crédito (mensal recorrente)',
  CARTAO_ANUAL: 'Cartão de crédito (anual)',
  BOLETO: 'Boleto (anual à vista)',
};

/**
 * Emissão automática do bilhete (M3). Idempotente em 3 camadas:
 * jobId = contratoId na fila, unique(contratoId) no banco e flags de
 * pdf/envio por canal — o job pode re-executar quantas vezes precisar.
 */
@Injectable()
export class EmissaoService {
  private readonly logger = new Logger(EmissaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeiro: FinanceiroService,
    private readonly pdf: BilhetePdfService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MESSAGING_PROVIDER) private readonly whatsapp: MessagingProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  async emitirParaContrato(contratoId: string): Promise<{ certificadoId: string; numero: string }> {
    const contrato = await this.prisma.contrato.findUnique({
      where: { id: contratoId },
      include: {
        cliente: true,
        aparelho: true,
        plano: true,
        loja: true,
        vendedor: true,
        vistoria: true,
        certificado: true,
        pagamentos: { where: { status: 'CONFIRMADO' }, orderBy: { pagoEm: 'asc' }, take: 1 },
      },
    });
    if (!contrato) throw new NotFoundException(`Contrato ${contratoId} não encontrado.`);

    let certificado = contrato.certificado;
    if (!certificado) {
      certificado = await this.criarCertificado(contrato);
      await this.registrarComissao(contrato, certificado.id);
    }

    const dados = this.montarDados(contrato, certificado);

    if (!certificado.pdfUrl || certificado.pdfUrl.startsWith('stub://')) {
      const buffer = await this.pdf.gerar(dados);
      const { url } = await this.storage.upload({
        chave: `certificados/${certificado.numero}.pdf`,
        conteudo: buffer,
        contentType: 'application/pdf',
      });
      certificado = await this.prisma.certificado.update({
        where: { id: certificado.id },
        data: { pdfUrl: url },
      });
      await this.audit('UPDATE', certificado.id, { pdfUrl: url });
    }

    await this.entregar(contrato, certificado, dados);
    return { certificadoId: certificado.id, numero: certificado.numero };
  }

  private async criarCertificado(contrato: ContratoCompleto) {
    const inicio = contrato.pagamentos[0]?.pagoEm ?? new Date();
    const { fim, carenciaAte } = calcularVigencia(inicio);
    const ano = inicio.getFullYear();

    try {
      const certificado = await this.prisma.$transaction(async (tx) => {
        // Série própria por ano, incremento atômico (PS-AAAA-000001).
        const [{ numero: sequencial }] = await tx.$queryRaw<{ numero: number }[]>`
          INSERT INTO certificado_series (ano, proximo) VALUES (${ano}, 2)
          ON CONFLICT (ano) DO UPDATE SET proximo = certificado_series.proximo + 1
          RETURNING proximo - 1 AS numero
        `;
        const criado = await tx.certificado.create({
          data: {
            numero: formatarNumeroCertificado(ano, Number(sequencial)),
            contratoId: contrato.id,
            vistoriaId: contrato.vistoriaId,
            clienteId: contrato.clienteId,
            aparelhoId: contrato.aparelhoId,
            planoId: contrato.planoId,
            lojaId: contrato.lojaId,
            vendedorId: contrato.vendedorId,
            formaPagamento: contrato.formaPagamento,
            vigenciaInicio: inicio,
            vigenciaFim: fim,
            carenciaAte,
            status: 'ATIVO',
          },
        });
        await tx.contrato.update({ where: { id: contrato.id }, data: { status: 'ATIVO' } });
        return criado;
      });
      await this.audit('CREATE', certificado.id, {
        numero: certificado.numero,
        contratoId: contrato.id,
        vigenciaInicio: certificado.vigenciaInicio,
        vigenciaFim: certificado.vigenciaFim,
      });
      this.logger.log(`Certificado ${certificado.numero} emitido para contrato ${contrato.id}`);
      return certificado;
    } catch (erro) {
      // Corrida entre webhooks duplicados: unique(contratoId) garante 1 emissão.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        const existente = await this.prisma.certificado.findUnique({
          where: { contratoId: contrato.id },
        });
        if (existente) return existente;
      }
      throw erro;
    }
  }

  private async registrarComissao(contrato: ContratoCompleto, certificadoId: string) {
    // Comissão já emitida para o certificado? (re-execução do job)
    const existente = await this.prisma.comissao.findFirst({ where: { certificadoId } });
    if (existente) return;
    await this.financeiro.registrarComissaoEmissao({
      lojaId: contrato.lojaId,
      certificadoId,
      premioBase: Number(contrato.premioTotal),
      comissaoPct: Number(contrato.loja.comissaoPct),
      regime: contrato.formaPagamento === 'CARTAO_RECORRENTE' ? 'PRO_RATA' : 'ANTECIPADA',
    });
  }

  private async entregar(
    contrato: ContratoCompleto,
    certificado: NonNullable<ContratoCompleto['certificado']>,
    dados: BilheteDados,
  ) {
    const buffer = await this.pdf.gerar(dados);
    const base64 = buffer.toString('base64');
    const primeiroNome = contrato.cliente.nome.trim().split(/\s+/)[0];
    const vigenciaFimBr = formatarDataBr(certificado.vigenciaFim);
    const nomeArquivo = `Certificado-${certificado.numero}.pdf`;

    if (!certificado.whatsappEnviadoEm) {
      const texto =
        `🎉 ${primeiroNome}, seu aparelho está protegido! Certificado ${certificado.numero} em anexo. ` +
        `Vigência até ${vigenciaFimBr}. Guarde este documento. Qualquer sinistro, é só chamar aqui.`;
      const { enviado, id } = await this.whatsapp.enviarWhatsapp({
        telefone: contrato.cliente.telefoneWhatsapp,
        texto,
        anexo: { nome: nomeArquivo, base64, contentType: 'application/pdf' },
      });
      await this.prisma.notificacaoLog.create({
        data: {
          canal: 'WHATSAPP',
          template: 'certificado_emitido',
          status: enviado ? 'ENVIADO' : 'FALHA',
          payload: { certificadoId: certificado.id, telefone: contrato.cliente.telefoneWhatsapp, mensagemId: id },
        },
      });
      if (!enviado) throw new Error(`Falha no envio WhatsApp do certificado ${certificado.numero} (retry).`);
      await this.prisma.certificado.update({
        where: { id: certificado.id },
        data: { whatsappEnviadoEm: new Date() },
      });
    }

    if (!certificado.emailEnviadoEm && contrato.cliente.email) {
      const { enviado } = await this.email.enviarEmail({
        para: contrato.cliente.email,
        assunto: `🎉 Seu aparelho está protegido — Certificado ${certificado.numero}`,
        html:
          `<p>Olá, <strong>${primeiroNome}</strong>!</p>` +
          `<p>Seu aparelho está protegido. O certificado <strong>${certificado.numero}</strong> está em anexo. ` +
          `Vigência até <strong>${vigenciaFimBr}</strong>.</p>` +
          `<p>Guarde este documento. Em caso de sinistro, fale com a gente pelo WhatsApp oficial da Proteção Solatium.</p>` +
          `<p>— Proteção Solatium</p>`,
        anexos: [{ nome: nomeArquivo, base64, contentType: 'application/pdf' }],
      });
      await this.prisma.notificacaoLog.create({
        data: {
          canal: 'EMAIL',
          template: 'certificado_emitido',
          status: enviado ? 'ENVIADO' : 'FALHA',
          payload: { certificadoId: certificado.id, email: contrato.cliente.email },
        },
      });
      if (enviado) {
        await this.prisma.certificado.update({
          where: { id: certificado.id },
          data: { emailEnviadoEm: new Date() },
        });
      }
    }
  }

  private montarDados(
    contrato: ContratoCompleto,
    certificado: NonNullable<ContratoCompleto['certificado']>,
  ): BilheteDados {
    const c = contrato.cliente;
    const endereco = [
      [c.logradouro, c.numero].filter(Boolean).join(', '),
      c.complemento,
      c.bairro,
      [c.cidade, c.uf].filter(Boolean).join('/'),
      c.cep ? `CEP ${c.cep}` : undefined,
    ]
      .filter(Boolean)
      .join(' — ');

    const validarBase =
      this.config.get<string>('PUBLIC_VALIDAR_URL') ??
      `${this.config.get<string>('APP_LOJA_URL') ?? 'http://localhost:5173'}/validar`;

    return {
      numero: certificado.numero,
      validarUrl: `${validarBase.replace(/\/$/, '')}/${certificado.codigoValidacao}`,
      cliente: {
        nome: c.nome,
        cpf: c.cpf,
        nascimento: c.nascimento,
        telefone: c.telefoneWhatsapp,
        email: c.email,
        endereco: endereco || '—',
      },
      aparelho: {
        marca: contrato.aparelho.marca,
        modelo: contrato.aparelho.modelo,
        armazenamentoGb: contrato.aparelho.armazenamentoGb,
        cor: contrato.aparelho.cor,
        imei: contrato.aparelho.imei,
        valorReferencia: Number(contrato.aparelho.valorMercado),
      },
      vistoria: {
        numero: contrato.vistoria.id.slice(0, 8).toUpperCase(),
        aprovadaEm: contrato.vistoria.updatedAt,
      },
      vigenciaInicio: certificado.vigenciaInicio,
      vigenciaFim: certificado.vigenciaFim,
      carenciaAte: certificado.carenciaAte ?? certificado.vigenciaInicio,
      formaPagamento: FORMA_LABEL[contrato.formaPagamento] ?? contrato.formaPagamento,
      franquiaPercentual: Number(contrato.plano.franquiaPercentual),
      loja: { nome: contrato.loja.nome, cnpj: contrato.loja.cnpj },
      rodape: this.rodape(),
    };
  }

  private rodape(): RodapeLegal {
    const get = (chave: string) => this.config.get<string>(chave);
    return {
      seguradoraNome: get('SEGURADORA_NOME'),
      seguradoraCnpj: get('SEGURADORA_CNPJ'),
      apoliceNumero: get('APOLICE_NUMERO'),
      processoSusep: get('PROCESSO_SUSEP'),
      estipulanteRazao: get('ESTIPULANTE_RAZAO'),
      estipulanteCnpj: get('ESTIPULANTE_CNPJ'),
      solatiumCnpj: get('SOLATIUM_CNPJ'),
      condicoesGeraisUrl: get('CONDICOES_GERAIS_URL'),
      seguradoraCentralTel: get('SEGURADORA_CENTRAL_TEL'),
    };
  }

  private async audit(acao: string, certificadoId: string, depois: Record<string, unknown>) {
    await this.prisma.auditLog
      .create({
        data: { acao, entidade: 'certificados', entidadeId: certificadoId, depois: depois as Prisma.InputJsonValue },
      })
      .catch((erro) => this.logger.error(`Falha ao auditar emissão: ${erro}`));
  }
}
