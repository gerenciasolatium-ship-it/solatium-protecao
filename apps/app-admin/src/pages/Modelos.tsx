import { useState } from 'react';
import type { FormEvent } from 'react';
import DataTable from '../components/DataTable';
import type { Coluna } from '../components/DataTable';
import Modal from '../components/Modal';
import { Campo } from '../components/Campo';
import { usePaginado } from '../lib/usePaginado';
import { api, ApiError } from '../lib/api';
import type { ModeloAparelho } from '../lib/types';
import { btnPerigo, btnPrimary, btnLink, btnSecundario, formatarMoeda } from '../lib/ui';

interface ModeloForm {
  marca: string;
  modelo: string;
  armazenamentoGb: string;
  valorReferencia: string;
  protecaoMensal: string;
  protecaoAnual: string;
}

const formVazio: ModeloForm = {
  marca: 'Apple',
  modelo: '',
  armazenamentoGb: '',
  valorReferencia: '',
  protecaoMensal: '',
  protecaoAnual: '',
};

function formatarGb(gb: number): string {
  return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;
}

export default function Modelos() {
  const lista = usePaginado<ModeloAparelho>('modelos-aparelho');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<ModeloAparelho | null>(null);
  const [form, setForm] = useState<ModeloForm>(formVazio);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirCriacao(): void {
    setEditando(null);
    setForm(formVazio);
    setErroForm(null);
    setModalAberto(true);
  }

  function abrirEdicao(m: ModeloAparelho): void {
    setEditando(m);
    setForm({
      marca: m.marca ?? '',
      modelo: m.modelo ?? '',
      armazenamentoGb: String(m.armazenamentoGb ?? ''),
      valorReferencia: m.valorReferencia != null ? String(m.valorReferencia) : '',
      protecaoMensal: m.protecaoMensal != null ? String(m.protecaoMensal) : '',
      protecaoAnual: m.protecaoAnual != null ? String(m.protecaoAnual) : '',
    });
    setErroForm(null);
    setModalAberto(true);
  }

  function set<K extends keyof ModeloForm>(campo: K, valor: string): void {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        armazenamentoGb: Number(form.armazenamentoGb),
        valorReferencia: Number(form.valorReferencia),
      };
      if (form.protecaoMensal.trim()) body.protecaoMensal = Number(form.protecaoMensal);
      if (form.protecaoAnual.trim()) body.protecaoAnual = Number(form.protecaoAnual);

      if (editando) {
        await api.atualizar('modelos-aparelho', editando.id, body);
      } else {
        await api.criar('modelos-aparelho', body);
      }
      setModalAberto(false);
      await lista.recarregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : 'Erro ao salvar o modelo.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(m: ModeloAparelho): Promise<void> {
    if (!window.confirm(`Inativar o modelo "${m.modelo} ${formatarGb(m.armazenamentoGb)}"?`))
      return;
    try {
      await api.remover('modelos-aparelho', m.id);
      await lista.recarregar();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Erro ao inativar o modelo.');
    }
  }

  const colunas: Coluna<ModeloAparelho>[] = [
    {
      titulo: 'Modelo',
      render: (m) => (
        <span className="font-medium text-slate-800">
          {m.modelo} <span className="text-slate-500">{formatarGb(m.armazenamentoGb)}</span>
        </span>
      ),
    },
    { titulo: 'Valor de referência', render: (m) => formatarMoeda(m.valorReferencia) },
    {
      titulo: 'Proteção mensal',
      render: (m) =>
        m.protecaoMensal != null ? (
          formatarMoeda(m.protecaoMensal)
        ) : (
          <span className="text-amber-600">a precificar</span>
        ),
    },
    {
      titulo: 'Proteção anual',
      render: (m) =>
        m.protecaoAnual != null ? (
          formatarMoeda(m.protecaoAnual)
        ) : (
          <span className="text-amber-600">a precificar</span>
        ),
    },
    {
      titulo: 'Ações',
      className: 'text-right',
      render: (m) => (
        <div className="flex justify-end gap-3">
          <button type="button" className={btnLink} onClick={() => abrirEdicao(m)}>
            Precificar
          </button>
          <button type="button" className={btnPerigo} onClick={() => void excluir(m)}>
            Inativar
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        titulo="Catálogo de modelos"
        colunas={colunas}
        dados={lista.itens}
        chave={(m) => m.id}
        carregando={lista.carregando}
        erro={lista.erro}
        busca={lista.busca}
        onBusca={lista.mudarBusca}
        buscaPlaceholder="Buscar por modelo…"
        pagina={lista.pagina}
        porPagina={lista.porPagina}
        total={lista.total}
        onPagina={lista.setPagina}
        acoes={
          <button type="button" className={btnPrimary} onClick={abrirCriacao}>
            Novo modelo
          </button>
        }
      />

      <Modal
        aberto={modalAberto}
        titulo={
          editando
            ? `Precificar — ${editando.modelo} ${formatarGb(editando.armazenamentoGb)}`
            : 'Novo modelo'
        }
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Marca" valor={form.marca} onChange={(v) => set('marca', v)} obrigatorio />
            <Campo
              label="Modelo"
              valor={form.modelo}
              onChange={(v) => set('modelo', v)}
              obrigatorio
            />
            <Campo
              label="Armazenamento (GB)"
              tipo="number"
              valor={form.armazenamentoGb}
              onChange={(v) => set('armazenamentoGb', v)}
              obrigatorio
            />
            <Campo
              label="Valor de referência (R$)"
              tipo="number"
              valor={form.valorReferencia}
              onChange={(v) => set('valorReferencia', v)}
              obrigatorio
            />
            <Campo
              label="Proteção mensal (R$)"
              tipo="number"
              valor={form.protecaoMensal}
              onChange={(v) => set('protecaoMensal', v)}
            />
            <Campo
              label="Proteção anual (R$)"
              tipo="number"
              valor={form.protecaoAnual}
              onChange={(v) => set('protecaoAnual', v)}
            />
          </div>

          {erroForm && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erroForm}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={btnSecundario} onClick={() => setModalAberto(false)}>
              Cancelar
            </button>
            <button type="submit" className={btnPrimary} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
