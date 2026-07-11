import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClienteProviderInput, CobrancaInput, CobrancaResult, PaymentProvider } from './interfaces';

/**
 * Asaas atrás da interface PaymentProvider (CLAUDE.md M4).
 * Sandbox: ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
 * Cartão no balcão: usamos o link de fatura do Asaas (invoiceUrl) — o cliente
 * digita o cartão na página do Asaas; recusa/estorno chega por webhook.
 */
@Injectable()
export class AsaasProvider implements PaymentProvider {
  private readonly logger = new Logger(AsaasProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('ASAAS_BASE_URL') ?? 'https://api-sandbox.asaas.com/v3'
    ).replace(/\/$/, '');
    this.apiKey = config.get<string>('ASAAS_API_KEY') ?? '';
  }

  private async request<T>(metodo: string, caminho: string, body?: unknown): Promise<T> {
    const resposta = await fetch(`${this.baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
        'User-Agent': 'solatium-protecao',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resposta.ok) {
      const erros = (json.errors as { description?: string }[] | undefined)
        ?.map((e) => e.description)
        .join('; ');
      this.logger.error(
        `Asaas ${metodo} ${caminho} → ${resposta.status}: ${erros ?? JSON.stringify(json)}`,
      );
      throw new ServiceUnavailableException(`Asaas: ${erros ?? `HTTP ${resposta.status}`}`);
    }
    return json as T;
  }

  async criarCliente(input: ClienteProviderInput): Promise<{ customerId: string }> {
    // Reaproveita cliente existente no Asaas pelo CPF (evita duplicar).
    const existentes = await this.request<{ data: { id: string }[] }>(
      'GET',
      `/customers?cpfCnpj=${input.cpf}&limit=1`,
    );
    if (existentes.data?.length) return { customerId: existentes.data[0].id };

    const criado = await this.request<{ id: string }>('POST', '/customers', {
      name: input.nome,
      cpfCnpj: input.cpf,
      email: input.email || undefined,
      mobilePhone: input.telefone || undefined,
      externalReference: input.referenciaExterna,
      notificationDisabled: true, // comunicação é nossa (Digisac/Resend), não do Asaas
    });
    return { customerId: criado.id };
  }

  async criarCobranca(input: CobrancaInput): Promise<CobrancaResult> {
    const vencimento = input.vencimento ?? new Date().toISOString().slice(0, 10);
    const split = input.split?.map((s) => ({
      walletId: s.walletId,
      percentualValue: s.percentual,
    }));

    if (input.formaPagamento === 'CARTAO_RECORRENTE') {
      const assinatura = await this.request<{ id: string }>('POST', '/subscriptions', {
        customer: input.customerId,
        billingType: 'CREDIT_CARD',
        value: input.valor,
        nextDueDate: vencimento,
        cycle: 'MONTHLY',
        description: input.descricao,
        externalReference: input.referenciaExterna,
        split,
      });
      // A 1ª cobrança da assinatura é criada na hora; é ela que o cliente paga no balcão.
      const pagamentos = await this.request<{
        data: { id: string; status: string; invoiceUrl?: string }[];
      }>('GET', `/subscriptions/${assinatura.id}/payments?limit=1`);
      const primeira = pagamentos.data?.[0];
      if (!primeira)
        throw new ServiceUnavailableException('Asaas: assinatura criada sem cobrança inicial');
      return {
        provedorId: primeira.id,
        assinaturaId: assinatura.id,
        status: primeira.status,
        linkPagamento: primeira.invoiceUrl,
      };
    }

    const billingType =
      input.formaPagamento === 'PIX'
        ? 'PIX'
        : input.formaPagamento === 'BOLETO'
          ? 'BOLETO'
          : 'CREDIT_CARD';
    const parcelado = input.formaPagamento === 'CARTAO_ANUAL' && (input.parcelas ?? 1) > 1;

    const pagamento = await this.request<{
      id: string;
      status: string;
      invoiceUrl?: string;
      bankSlipUrl?: string;
    }>('POST', '/payments', {
      customer: input.customerId,
      billingType,
      dueDate: vencimento,
      description: input.descricao,
      externalReference: input.referenciaExterna,
      split,
      ...(parcelado
        ? { installmentCount: input.parcelas, totalValue: input.valor }
        : { value: input.valor }),
    });

    const resultado: CobrancaResult = {
      provedorId: pagamento.id,
      status: pagamento.status,
      linkPagamento: pagamento.invoiceUrl,
      boletoUrl: pagamento.bankSlipUrl,
    };

    if (input.formaPagamento === 'PIX') {
      const qr = await this.request<{ encodedImage?: string; payload?: string }>(
        'GET',
        `/payments/${pagamento.id}/pixQrCode`,
      );
      resultado.pixQrCodeBase64 = qr.encodedImage;
      resultado.pixCopiaCola = qr.payload;
    }

    return resultado;
  }

  /** Best-effort: cobrança já paga/estornada não é cancelável — retorna false. */
  async cancelarCobranca(provedorId: string): Promise<{ cancelada: boolean }> {
    try {
      await this.request<{ deleted: boolean }>('DELETE', `/payments/${provedorId}`);
      return { cancelada: true };
    } catch (erro) {
      this.logger.warn(`Não foi possível cancelar a cobrança ${provedorId}: ${erro}`);
      return { cancelada: false };
    }
  }

  async cancelarAssinatura(assinaturaId: string): Promise<{ cancelada: boolean }> {
    try {
      await this.request<{ deleted: boolean }>('DELETE', `/subscriptions/${assinaturaId}`);
      return { cancelada: true };
    } catch (erro) {
      this.logger.warn(`Não foi possível cancelar a assinatura ${assinaturaId}: ${erro}`);
      return { cancelada: false };
    }
  }
}
