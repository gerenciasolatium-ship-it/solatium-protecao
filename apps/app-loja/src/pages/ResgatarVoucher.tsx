import { useState } from 'react';
import { Header } from '../components/Header';
import { apiFetch, ApiError } from '../lib/api';

interface Voucher {
  codigo: string;
  valor: string;
  validade: string;
  status: string;
  resgatadoEm?: string | null;
  resgatavel: boolean;
  motivoNaoResgatavel: string | null;
  sinistro: {
    cliente: { nome: string; cpf: string };
    certificado: { numero: string; aparelho: { marca: string; modelo: string } };
  };
  lojaResgate?: { nome: string } | null;
}

function moeda(valor: string | number): string {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Resgate de voucher no balcão (M6): busca pelo código, confere cliente e
 * confirma a baixa. O cliente usa o valor na compra do aparelho novo — e pode
 * contratar nova proteção na sequência.
 */
export function ResgatarVoucher() {
  const [codigo, setCodigo] = useState('');
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resgatado, setResgatado] = useState(false);

  async function buscar(): Promise<void> {
    setCarregando(true);
    setErro(null);
    setResgatado(false);
    try {
      setVoucher(await apiFetch<Voucher>(`/vouchers/${encodeURIComponent(codigo.trim())}`));
    } catch (e) {
      setVoucher(null);
      setErro(e instanceof ApiError ? e.message : 'Erro ao consultar o voucher.');
    } finally {
      setCarregando(false);
    }
  }

  async function resgatar(): Promise<void> {
    if (!voucher) return;
    if (
      !window.confirm(
        `Confirmar o resgate de ${moeda(voucher.valor)} para ${voucher.sinistro.cliente.nome}?`,
      )
    ) {
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      await apiFetch(`/vouchers/${encodeURIComponent(voucher.codigo)}/resgatar`, {
        method: 'POST',
      });
      setResgatado(true);
      setVoucher(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro ao resgatar o voucher.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Header titulo="Resgatar voucher" voltar />

      <main className="mx-auto max-w-app px-4 py-5">
        <label className="mb-1 block text-sm font-medium text-slate-700">Código do voucher</label>
        <div className="flex gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="VC-XXXXXXXXXX"
            autoCapitalize="characters"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 font-mono text-base uppercase outline-none focus:border-sol-azul"
          />
          <button
            onClick={() => void buscar()}
            disabled={carregando || codigo.trim().length < 5}
            className="shrink-0 rounded-xl bg-sol-azul px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            Buscar
          </button>
        </div>

        {erro && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        {resgatado && (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <div className="text-4xl">✅</div>
            <div className="mt-2 text-lg font-semibold text-green-800">Voucher resgatado!</div>
            <p className="mt-1 text-sm text-green-700">
              Registre a venda do aparelho novo — e ofereça uma nova proteção na hora. 😉
            </p>
          </div>
        )}

        {voucher && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-slate-500">{voucher.codigo}</span>
              <span className="text-2xl font-bold text-slate-900">{moeda(voucher.valor)}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div>
                <span className="text-slate-400">Cliente: </span>
                <span className="font-medium text-slate-800">{voucher.sinistro.cliente.nome}</span>
              </div>
              <div>
                <span className="text-slate-400">Certificado: </span>
                {voucher.sinistro.certificado.numero} ({voucher.sinistro.certificado.aparelho.marca}{' '}
                {voucher.sinistro.certificado.aparelho.modelo})
              </div>
              <div>
                <span className="text-slate-400">Validade: </span>
                {new Date(voucher.validade).toLocaleDateString('pt-BR')}
              </div>
            </div>

            {voucher.resgatavel ? (
              <button
                onClick={() => void resgatar()}
                disabled={carregando}
                className="mt-4 w-full rounded-xl bg-sol-verde py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
              >
                {carregando ? 'Resgatando…' : 'Confirmar resgate'}
              </button>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {voucher.motivoNaoResgatavel}
                {voucher.lojaResgate ? ` (loja: ${voucher.lojaResgate.nome})` : ''}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
