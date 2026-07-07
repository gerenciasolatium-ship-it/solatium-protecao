import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import {
  RodapeLegal,
  calcularVoucher,
  formatarDataBr,
  formatarDataHoraBr,
  formatarMoeda,
  mascararImei,
  rodapeLegalCompleto,
} from './bilhete.util';

export interface BilheteDados {
  numero: string;
  validarUrl: string;
  cliente: {
    nome: string;
    cpf: string;
    nascimento?: Date | null;
    telefone: string;
    email?: string | null;
    endereco: string;
  };
  aparelho: {
    marca: string;
    modelo: string;
    armazenamentoGb: number;
    cor?: string | null;
    imei: string;
    valorReferencia: number;
  };
  vistoria: { numero: string; aprovadaEm: Date };
  vigenciaInicio: Date;
  vigenciaFim: Date;
  carenciaAte: Date;
  formaPagamento: string;
  franquiaPercentual: number;
  loja: { nome: string; cnpj: string };
  rodape: RodapeLegal;
}

const AZUL = '#0B2545';
const DOURADO = '#B8860B';
const CINZA = '#444444';
const M = 40; // margem
const LARGURA = 595.28; // A4 pt

@Injectable()
export class BilhetePdfService {
  async gerar(dados: BilheteDados): Promise<Buffer> {
    const qr = await QRCode.toBuffer(dados.validarUrl, { width: 180, margin: 1 });
    const doc = new PDFDocument({
      size: 'A4',
      margin: M,
      info: { Title: `Certificado ${dados.numero}` },
    });
    const blocos: Buffer[] = [];
    doc.on('data', (b: Buffer) => blocos.push(b));
    const fim = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(blocos))),
    );

    const emTeste = !rodapeLegalCompleto(dados.rodape);
    if (emTeste) this.marcaDagua(doc);

    this.cabecalho(doc, dados, qr);

    let y = 130;
    y = this.bloco(doc, y, 'SEGURADO', [
      ['Nome completo', dados.cliente.nome],
      ['CPF', dados.cliente.cpf],
      [
        'Data de nascimento',
        dados.cliente.nascimento ? formatarDataBr(dados.cliente.nascimento) : '—',
      ],
      ['Telefone/WhatsApp', dados.cliente.telefone],
      ['Email', dados.cliente.email || '—'],
      ['Endereço', dados.cliente.endereco],
    ]);

    y = this.bloco(doc, y, 'APARELHO SEGURADO', [
      ['Marca / Modelo', `${dados.aparelho.marca} ${dados.aparelho.modelo}`],
      ['Armazenamento', `${dados.aparelho.armazenamentoGb} GB`],
      ['Cor', dados.aparelho.cor || '—'],
      ['IMEI', dados.aparelho.imei],
      ['Valor de referência (capital segurado)', formatarMoeda(dados.aparelho.valorReferencia)],
      [
        'Vistoria aprovada',
        `nº ${dados.vistoria.numero} em ${formatarDataHoraBr(dados.vistoria.aprovadaEm)}`,
      ],
    ]);

    y = this.bloco(doc, y, 'VIGÊNCIA', [
      ['Início', formatarDataHoraBr(dados.vigenciaInicio)],
      ['Fim', formatarDataHoraBr(dados.vigenciaFim)],
      [
        'Carência roubo/furto',
        `72 horas — cobertura plena a partir de ${formatarDataHoraBr(dados.carenciaAte)}`,
      ],
      ['Forma de pagamento', dados.formaPagamento],
    ]);

    y = this.caixaCobertura(doc, y, dados);
    this.rodapeLegal(doc, dados, emTeste);

    doc.end();
    return fim;
  }

  private cabecalho(doc: PDFKit.PDFDocument, dados: BilheteDados, qr: Buffer) {
    doc.rect(0, 0, LARGURA, 100).fill(AZUL);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('PROTEÇÃO SOLATIUM', M, 22);
    doc.font('Helvetica').fontSize(12).text('Certificado Individual de Seguro', M, 50);
    doc.font('Helvetica-Bold').fontSize(14).text(dados.numero, M, 70);
    doc.image(qr, LARGURA - M - 72, 14, { width: 72 });
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .text('Valide este certificado:', LARGURA - M - 130, 40, { width: 55, align: 'right' })
      .text(dados.validarUrl, LARGURA - M - 190, 88, { width: 190, align: 'right' });
    doc.fillColor('#000000');
  }

  private bloco(
    doc: PDFKit.PDFDocument,
    y: number,
    titulo: string,
    linhas: [string, string][],
  ): number {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(AZUL).text(titulo, M, y);
    doc
      .moveTo(M, y + 13)
      .lineTo(LARGURA - M, y + 13)
      .lineWidth(0.7)
      .strokeColor(AZUL)
      .stroke();
    let atual = y + 19;
    for (const [rotulo, valor] of linhas) {
      doc
        .font('Helvetica-Bold')
        .fontSize(8.2)
        .fillColor(CINZA)
        .text(`${rotulo}: `, M, atual, { continued: true });
      doc.font('Helvetica').fillColor('#000000').text(valor);
      atual = doc.y + 2;
    }
    return atual + 8;
  }

  private caixaCobertura(doc: PDFKit.PDFDocument, y: number, dados: BilheteDados): number {
    const { voucher, franquia } = calcularVoucher(
      dados.aparelho.valorReferencia,
      dados.franquiaPercentual,
    );
    const largura = LARGURA - 2 * M;
    const altura = 132;
    doc.roundedRect(M, y, largura, altura, 6).lineWidth(1.5).strokeColor(DOURADO).stroke();
    doc.roundedRect(M, y, largura, 18, 6).fill(DOURADO);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('COBERTURA E FRANQUIA', M, y + 4, {
        width: largura,
        align: 'center',
      });

    const px = M + 10;
    const pw = largura - 20;
    let atual = y + 24;
    const item = (texto: string, negrito = false) => {
      doc
        .font(negrito ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor('#000000')
        .text(texto, px, atual, { width: pw });
      atual = doc.y + 2.5;
    };

    item('Cobertura: roubo e furto qualificado do aparelho segurado.');
    item('Indenização: voucher para aquisição de outro aparelho na loja parceira de origem.');
    item(
      `FRANQUIA: ${dados.franquiaPercentual.toLocaleString('pt-BR')}% do valor de referência do aparelho, deduzida da indenização.`,
      true,
    );
    item(
      `Aparelho segurado: ${formatarMoeda(dados.aparelho.valorReferencia)}. Em caso de sinistro coberto, seu voucher será de ` +
        `${formatarMoeda(voucher)} (indenização) e sua participação (franquia) será de ${formatarMoeda(franquia)}.`,
      true,
    );
    item(
      'Como acionar: WhatsApp oficial da Proteção Solatium (canal de sinistro) + Boletim de Ocorrência (B.O.).',
    );
    item(
      'Principais exclusões (resumo): furto simples sem vestígios (quando não coberto), quebra acidental, perda e esquecimento — conforme condições gerais.',
    );
    return y + altura + 10;
  }

  private rodapeLegal(doc: PDFKit.PDFDocument, dados: BilheteDados, emTeste: boolean) {
    const r = dados.rodape;
    const ph = (v: string | undefined, nome: string) => v?.trim() || `{${nome}}`;
    const linhas = [
      `Seguradora: ${ph(r.seguradoraNome, 'SEGURADORA_NOME')} — CNPJ ${ph(r.seguradoraCnpj, 'SEGURADORA_CNPJ')} — ` +
        `Apólice coletiva nº ${ph(r.apoliceNumero, 'APOLICE_NUMERO')} — Processo SUSEP ${ph(r.processoSusep, 'PROCESSO_SUSEP')}`,
      `Estipulante: ${ph(r.estipulanteRazao, 'ESTIPULANTE_RAZAO')} — CNPJ ${ph(r.estipulanteCnpj, 'ESTIPULANTE_CNPJ')}`,
      `Corretora: Solatium Seguros — SUSEP 221136609 — CNPJ ${ph(r.solatiumCnpj, 'SOLATIUM_CNPJ')}`,
      `Loja parceira (representante de seguros): ${dados.loja.nome} — CNPJ ${dados.loja.cnpj}`,
      `Central da seguradora: ${ph(r.seguradoraCentralTel, 'SEGURADORA_CENTRAL_TEL')} — SUSEP: 0800 021 8484 / susep.gov.br — ` +
        `Condições gerais: ${ph(r.condicoesGeraisUrl, 'CONDICOES_GERAIS_URL')}`,
    ];
    const yBase = 841.89 - M - linhas.length * 11 - 14;
    doc
      .moveTo(M, yBase - 4)
      .lineTo(LARGURA - M, yBase - 4)
      .lineWidth(0.5)
      .strokeColor(CINZA)
      .stroke();
    doc.font('Helvetica').fontSize(6.8).fillColor(CINZA);
    linhas.forEach((linha, i) => doc.text(linha, M, yBase + i * 11, { width: LARGURA - 2 * M }));
    if (emTeste) {
      doc
        .font('Helvetica-Bold')
        .fillColor('#B00020')
        .text(
          'AMBIENTE DE TESTE — DOCUMENTO SEM VALIDADE LEGAL',
          M,
          yBase + linhas.length * 11 + 2,
          {
            width: LARGURA - 2 * M,
            align: 'center',
          },
        );
    }
  }

  private marcaDagua(doc: PDFKit.PDFDocument) {
    doc.save();
    doc.rotate(-38, { origin: [LARGURA / 2, 420] });
    doc.font('Helvetica-Bold').fontSize(34).fillColor('#B00020').opacity(0.16);
    doc.text('AMBIENTE DE TESTE — SEM VALIDADE', 0, 400, { width: LARGURA, align: 'center' });
    doc.text('AMBIENTE DE TESTE — SEM VALIDADE', 0, 180, { width: LARGURA, align: 'center' });
    doc.text('AMBIENTE DE TESTE — SEM VALIDADE', 0, 620, { width: LARGURA, align: 'center' });
    doc.opacity(1).restore();
    doc.fillColor('#000000');
  }
}
