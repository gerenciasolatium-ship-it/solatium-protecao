import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { usePaginado } from '../lib/usePaginado';
import DataTable, { type Coluna } from '../components/DataTable';
import Modal from '../components/Modal';
import {
  btnPrimary,
  btnSecundario,
  formatarCpf,
  formatarMoeda,
  inputClass,
  labelClass,
} from '../lib/ui';

interface Sinistro {
  id: string;
  status: string;
  relato?: string | null;
  boUrl?: string | null;
  boData?: string | null;
  motivoNegativa?: string | null;
  decididoEm?: string | null;
  valorIndenizacao?: number | string | null;
  alertasFraude?: Array<{ codigo: string; descricao: string }> | null;
  createdAt: string;
  cliente: { id: string; nome: string; cpf: string };
  certificado: {
    id: string;
    numero: string;
    status: string;
    vigenciaInicio: string;
    vigenciaFim: string;
    aparelho: { marca: string; modelo: string; imei: string; valorMercado: string };
    plano: { nome: string; franquiaPercentual: string };
  };
  loja: { id: string; nome: string };
  voucher?: {
    codigo: string;
    valor: string;
    validade: string;
    status: string;
    resgatadoEm?: string | null;
  } | null;
}

const STATUS_INFO: Record<string, { rotulo: string; classe: string }> = {
  ABERTO: { rotulo: 'Aberto', classe: 'bg-slate-100 text-slate-700' },
  DOCUMENTACAO_PENDENTE: { rotulo: 'Doc. pendente', classe: 'bg-amber-100 text-amber-800' },
  EM_ANALISE: { rotulo: 'Em análise', classe: 'bg-blue-100 text-blue-800' },
  APROVADO: { rotulo: 'Aprovado', classe: 'bg-green-100 text-green-800' },
  NEGADO: { rotulo: 'Negado', classe: 'bg-red-100 text-red-800' },
};

function BadgeStatus({ status }: { status: string }) {
  const info = STATUS_INFO[status] ?? { rotulo: status, classe: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${info.classe}`}>
      {info.rotulo}
    </span>
  );
}

function dataBr(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

export default function Sinistros() {
  const lista = usePaginado<Sinistro>('sinistros');
  const [selecionado, setSelecionado] = useState<Sinistro | null>(null);
  const [motivoNegativa, setMotivoNegativa] = useState('');
  const [negando, setNegando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function mudarStatus(status: string, motivo?: string) {
    if (!selecionado) return;
    setSalvando(true);
    setErroAcao(null);
    try {
      const atualizado = await api.post<Sinistro>(`/sinistros/${selecionado.id}/status`, {
        status,
        ...(motivo ? { motivo } : {}),
      });
      setSelecionado(atualizado);
      setNegando(false);
      setMotivoNegativa('');
      await lista.recarregar();
    } catch (e) {
      setErroAcao(e instanceof ApiError ? e.message : 'Erro ao atualizar o sinistro.');
    } finally {
      setSalvando(false);
    }
  }

  const colunas: Coluna<Sinistro>[] = [
    {
      titulo: 'Certificado',
      render: (s) => (
        <div>
          <div className="font-medium text-slate-800">{s.certificado.numero}</div>
          <div className="text-xs text-slate-400">{dataBr(s.createdAt)}</div>
        </div>
      ),
    },
    {
      titulo: 'Cliente',
      render: (s) => (
        <div>
          <div>{s.cliente.nome}</div>
          <div className="text-xs text-slate-400">{formatarCpf(s.cliente.cpf)}</div>
        </div>
      ),
    },
    {
      titulo: 'Aparelho',
      render: (s) => `${s.certificado.aparelho.marca} ${s.certificado.aparelho.modelo}`,
    },
    { titulo: 'Loja', render: (s) => s.loja.nome },
    {
      titulo: 'Alertas',
      render: (s) =>
        s.alertasFraude?.length ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            ⚠ {s.alertasFraude.length} alerta(s)
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    { titulo: 'Status', render: (s) => <BadgeStatus status={s.status} /> },
    {
      titulo: '',
      className: 'text-right',
      render: (s) => (
        <button
          type="button"
          className="text-sm font-medium text-sol-azul hover:underline"
          onClick={() => {
            setSelecionado(s);
            setNegando(false);
            setErroAcao(null);
          }}
        >
          Analisar
        </button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        titulo="Sinistros"
        colunas={colunas}
        dados={lista.itens}
        chave={(s) => s.id}
        carregando={lista.carregando}
        erro={lista.erro}
        busca={lista.busca}
        onBusca={lista.mudarBusca}
        buscaPlaceholder="Cliente ou nº do certificado…"
        pagina={lista.pagina}
        porPagina={lista.porPagina}
        total={lista.total}
        onPagina={lista.setPagina}
        vazio="Nenhum sinistro registrado."
      />

      <Modal
        aberto={selecionado !== null}
        titulo={`Sinistro — ${selecionado?.certificado.numero ?? ''}`}
        onFechar={() => setSelecionado(null)}
      >
        {selecionado && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <BadgeStatus status={selecionado.status} />
              <span className="text-xs text-slate-400">
                Aberto em {dataBr(selecionado.createdAt)}
              </span>
            </div>

            {(selecionado.alertasFraude?.length ?? 0) > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-3">
                <div className="mb-1 font-medium text-red-800">⚠ Alertas antifraude</div>
                <ul className="list-inside list-disc space-y-0.5 text-red-700">
                  {selecionado.alertasFraude!.map((a) => (
                    <li key={a.codigo}>{a.descricao}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-400">Cliente</div>
                <div className="font-medium text-slate-800">{selecionado.cliente.nome}</div>
                <div className="text-xs text-slate-500">{formatarCpf(selecionado.cliente.cpf)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Loja de origem</div>
                <div className="font-medium text-slate-800">{selecionado.loja.nome}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Aparelho segurado</div>
                <div className="text-slate-700">
                  {selecionado.certificado.aparelho.marca} {selecionado.certificado.aparelho.modelo}
                </div>
                <div className="text-xs text-slate-500">
                  IMEI …{selecionado.certificado.aparelho.imei.slice(-4)} — capital{' '}
                  {formatarMoeda(Number(selecionado.certificado.aparelho.valorMercado))}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Vigência</div>
                <div className="text-slate-700">
                  {dataBr(selecionado.certificado.vigenciaInicio)} —{' '}
                  {dataBr(selecionado.certificado.vigenciaFim)}
                </div>
                <div className="text-xs text-slate-500">
                  Franquia do plano: {Number(selecionado.certificado.plano.franquiaPercentual)}%
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400">Relato</div>
              <p className="whitespace-pre-wrap text-slate-700">
                {selecionado.relato || 'Sem relato registrado.'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div>
                <div className="text-xs text-slate-400">B.O. digital</div>
                {selecionado.boUrl ? (
                  <a
                    href={selecionado.boUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-sol-azul hover:underline"
                  >
                    Abrir documento ↗
                  </a>
                ) : (
                  <span className="text-amber-600">Pendente (obrigatório para aprovar)</span>
                )}
              </div>
              {selecionado.boData && (
                <div>
                  <div className="text-xs text-slate-400">Data do B.O.</div>
                  <div className="text-slate-700">{dataBr(selecionado.boData)}</div>
                </div>
              )}
            </div>

            {selecionado.voucher && (
              <div className="rounded border border-green-200 bg-green-50 p-3">
                <div className="font-medium text-green-800">
                  Voucher {selecionado.voucher.codigo} —{' '}
                  {formatarMoeda(Number(selecionado.voucher.valor))}
                </div>
                <div className="text-xs text-green-700">
                  {selecionado.voucher.status === 'RESGATADO'
                    ? `Resgatado em ${dataBr(selecionado.voucher.resgatadoEm)}`
                    : `Válido até ${dataBr(selecionado.voucher.validade)} — resgate na loja de origem`}
                </div>
              </div>
            )}

            {selecionado.status === 'NEGADO' && selecionado.motivoNegativa && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-red-800">
                <span className="font-medium">Motivo da negativa:</span>{' '}
                {selecionado.motivoNegativa}
              </div>
            )}

            {erroAcao && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                {erroAcao}
              </div>
            )}

            {/* Esteira: decisões do backoffice */}
            {!['APROVADO', 'NEGADO'].includes(selecionado.status) && (
              <div className="border-t border-slate-200 pt-4">
                {negando ? (
                  <div className="space-y-2">
                    <label className={labelClass}>Motivo da negativa</label>
                    <textarea
                      value={motivoNegativa}
                      onChange={(e) => setMotivoNegativa(e.target.value)}
                      className={`${inputClass} min-h-20`}
                      placeholder="Ex.: B.O. incompatível com o relato…"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={salvando || motivoNegativa.trim().length < 3}
                        onClick={() => void mudarStatus('NEGADO', motivoNegativa.trim())}
                        className="inline-flex items-center justify-center rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        Confirmar negativa
                      </button>
                      <button
                        type="button"
                        className={btnSecundario}
                        onClick={() => setNegando(false)}
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selecionado.status !== 'EM_ANALISE' && (
                      <button
                        type="button"
                        disabled={salvando}
                        className={btnPrimary}
                        onClick={() => void mudarStatus('EM_ANALISE')}
                      >
                        Mover para análise
                      </button>
                    )}
                    {selecionado.status === 'EM_ANALISE' && (
                      <>
                        <button
                          type="button"
                          disabled={salvando || !selecionado.boUrl}
                          title={!selecionado.boUrl ? 'B.O. obrigatório para aprovar' : undefined}
                          className="inline-flex items-center justify-center rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void mudarStatus('APROVADO')}
                        >
                          Aprovar e emitir voucher
                        </button>
                        <button
                          type="button"
                          disabled={salvando}
                          className={btnSecundario}
                          onClick={() => void mudarStatus('DOCUMENTACAO_PENDENTE')}
                        >
                          Pedir documentação
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={salvando}
                      className="inline-flex items-center justify-center rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                      onClick={() => setNegando(true)}
                    >
                      Negar
                    </button>
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  Aprovação gera voucher automático de capital × (1 − franquia do plano), validade
                  de 90 dias, resgate na loja de origem.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
