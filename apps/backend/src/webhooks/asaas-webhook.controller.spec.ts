import { UnauthorizedException } from '@nestjs/common';
import { AsaasWebhookController } from './asaas-webhook.controller';

/**
 * Idempotência do M3/M4: webhook duplicado NUNCA gera segundo certificado.
 * (Camadas seguintes: jobId único no BullMQ e unique(contratoId) no banco.)
 */
describe('AsaasWebhookController', () => {
  const TOKEN = 'segredo-webhook';

  function montar(
    overrides: { certificadoExistente?: boolean; pagamento?: Record<string, unknown> | null } = {},
  ) {
    const prisma = {
      pagamento: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides.pagamento !== undefined
              ? overrides.pagamento
              : { id: 'pag-1', status: 'PENDENTE', contratoId: 'contrato-1' },
          ),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      certificado: {
        findUnique: jest
          .fn()
          .mockResolvedValue(overrides.certificadoExistente ? { id: 'cert-1' } : null),
      },
      contrato: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const fila = { add: jest.fn().mockResolvedValue({}) };
    const config = { get: jest.fn().mockReturnValue(TOKEN) };
    const controller = new AsaasWebhookController(prisma as never, config as never, fila as never);
    return { controller, prisma, fila };
  }

  const evento = (id = 'asaas-pay-1') => ({
    event: 'PAYMENT_CONFIRMED',
    payment: { id, externalReference: 'contrato-1', paymentDate: '2026-07-07' },
  });

  it('rejeita token inválido', async () => {
    const { controller } = montar();
    await expect(controller.receber(evento(), 'token-errado')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('1ª confirmação: marca pagamento CONFIRMADO e enfileira emissão com jobId do contrato', async () => {
    const { controller, prisma, fila } = montar();
    await controller.receber(evento(), TOKEN);
    expect(prisma.pagamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMADO' }) }),
    );
    expect(fila.add).toHaveBeenCalledWith(
      'emitir-certificado',
      { contratoId: 'contrato-1' },
      { jobId: 'emitir-contrato-1' },
    );
  });

  it('webhook DUPLICADO com certificado já emitido: NÃO enfileira de novo', async () => {
    const { controller, fila } = montar({
      certificadoExistente: true,
      pagamento: { id: 'pag-1', status: 'CONFIRMADO', contratoId: 'contrato-1' },
    });
    await controller.receber(evento(), TOKEN);
    expect(fila.add).not.toHaveBeenCalled();
  });

  it('cobrança desconhecida sem contrato: responde 200 e ignora', async () => {
    const { controller, fila } = montar({ pagamento: null });
    const resposta = await controller.receber(evento('asaas-x'), TOKEN);
    expect(resposta).toEqual(expect.objectContaining({ recebido: true }));
    expect(fila.add).not.toHaveBeenCalled();
  });

  it('PAYMENT_OVERDUE marca VENCIDO sem enfileirar', async () => {
    const { controller, prisma, fila } = montar();
    await controller.receber({ event: 'PAYMENT_OVERDUE', payment: { id: 'asaas-pay-1' } }, TOKEN);
    expect(prisma.pagamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'VENCIDO' } }),
    );
    expect(fila.add).not.toHaveBeenCalled();
  });
});
