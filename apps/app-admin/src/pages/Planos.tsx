import { useState } from 'react';
import type { FormEvent } from 'react';
import { PlanoPeriodicidade } from '@solatium/shared';
import DataTable from '../components/DataTable';
import type { Coluna } from '../components/DataTable';
import Modal from '../components/Modal';
import { Campo, CampoSelect } from '../components/Campo';
import { usePaginado } from '../lib/usePaginado';
import { api, ApiError } from '../lib/api';
import type { Plano } from '../lib/types';
import { btnPerigo, btnPrimary, btnLink, btnSecundario, formatarMoeda } from '../lib/ui';

interface PlanoForm {
  nome: string;
  descricao: string;
  periodicidade: string;
  premioMensal: string;
  premioAnual: string;
  franquia: string;
  capitalSegurado: string;
  valorAparelhoMin: string;
  valorAparelhoMax: string;
}

const formVazio: PlanoForm = {
  nome: '',
  descricao: '',
  periodicidade: PlanoPeriodicidade.MENSAL,
  premioMensal: '',
  premioAnual: '',
  franquia: '',
  capitalSegurado: '',
  valorAparelhoMin: '',
  valorAparelhoMax: '',
};

export default function Planos() {
  const lista = usePaginado<Plano>('planos');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Plano | null>(null);
  const [form, setForm] = useState<PlanoForm>(formVazio);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirCriacao(): void {
    setEditando(null);
    setForm(formVazio);
    setErroForm(null);
    setModalAberto(true);
  }

  function abrirEdicao(p: Plano): void {
    setEditando(p);
    setForm({
      nome: p.nome ?? '',
      descricao: p.descricao ?? '',
      periodicidade: p.periodicidade ?? PlanoPeriodicidade.MENSAL,
      premioMensal: p.premioMensal != null ? String(p.premioMensal) : '',
      premioAnual: p.premioAnual != null ? String(p.premioAnual) : '',
      franquia: p.franquia != null ? String(p.franquia) : '',
      capitalSegurado: p.capitalSegurado != null ? String(p.capitalSegurado) : '',
      valorAparelhoMin: p.valorAparelhoMin != null ? String(p.valorAparelhoMin) : '',
      valorAparelhoMax: p.valorAparelhoMax != null ? String(p.valorAparelhoMax) : '',
    });
    setErroForm(null);
    setModalAberto(true);
  }

  function set<K extends keyof PlanoForm>(campo: K, valor: string): void {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        nome: form.nome.trim(),
        periodicidade: form.periodicidade,
        capitalSegurado: Number(form.capitalSegurado),
      };
      if (form.descricao.trim()) body.descricao = form.descricao.trim();

      const numericos: (keyof PlanoForm)[] = [
        'premioMensal',
        'premioAnual',
        'franquia',
        'valorAparelhoMin',
        'valorAparelhoMax',
      ];
      for (const campo of numericos) {
        const valor = form[campo].trim();
        if (valor) body[campo] = Number(valor);
      }

      if (editando) {
        await api.atualizar('planos', editando.id, body);
      } else {
        await api.criar('planos', body);
      }
      setModalAberto(false);
      await lista.recarregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : 'Erro ao salvar o plano.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: Plano): Promise<void> {
    if (!window.confirm(`Excluir/inativar o plano "${p.nome}"?`)) return;
    try {
      await api.remover('planos', p.id);
      await lista.recarregar();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Erro ao excluir o plano.');
    }
  }

  const colunas: Coluna<Plano>[] = [
    { titulo: 'Nome', render: (p) => <span className="font-medium text-slate-800">{p.nome}</span> },
    { titulo: 'Periodicidade', render: (p) => p.periodicidade },
    { titulo: 'Prêmio mensal', render: (p) => formatarMoeda(p.premioMensal) },
    { titulo: 'Prêmio anual', render: (p) => formatarMoeda(p.premioAnual) },
    { titulo: 'Capital segurado', render: (p) => formatarMoeda(p.capitalSegurado) },
    {
      titulo: 'Ações',
      className: 'text-right',
      render: (p) => (
        <div className="flex justify-end gap-3">
          <button type="button" className={btnLink} onClick={() => abrirEdicao(p)}>
            Editar
          </button>
          <button type="button" className={btnPerigo} onClick={() => void excluir(p)}>
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        titulo="Planos"
        colunas={colunas}
        dados={lista.itens}
        chave={(p) => p.id}
        carregando={lista.carregando}
        erro={lista.erro}
        busca={lista.busca}
        onBusca={lista.mudarBusca}
        buscaPlaceholder="Buscar por nome…"
        pagina={lista.pagina}
        porPagina={lista.porPagina}
        total={lista.total}
        onPagina={lista.setPagina}
        acoes={
          <button type="button" className={btnPrimary} onClick={abrirCriacao}>
            Novo plano
          </button>
        }
      />

      <Modal
        aberto={modalAberto}
        titulo={editando ? 'Editar plano' : 'Novo plano'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              label="Nome"
              valor={form.nome}
              onChange={(v) => set('nome', v)}
              obrigatorio
              className="sm:col-span-2"
            />
            <Campo
              label="Descrição"
              valor={form.descricao}
              onChange={(v) => set('descricao', v)}
              className="sm:col-span-2"
            />
            <CampoSelect
              label="Periodicidade"
              valor={form.periodicidade}
              onChange={(v) => set('periodicidade', v)}
              obrigatorio
              opcoes={[
                { valor: PlanoPeriodicidade.MENSAL, rotulo: 'Mensal' },
                { valor: PlanoPeriodicidade.ANUAL, rotulo: 'Anual' },
              ]}
            />
            <Campo
              label="Capital segurado (R$)"
              tipo="number"
              valor={form.capitalSegurado}
              onChange={(v) => set('capitalSegurado', v)}
              obrigatorio
            />
            <Campo
              label="Prêmio mensal (R$)"
              tipo="number"
              valor={form.premioMensal}
              onChange={(v) => set('premioMensal', v)}
            />
            <Campo
              label="Prêmio anual (R$)"
              tipo="number"
              valor={form.premioAnual}
              onChange={(v) => set('premioAnual', v)}
            />
            <Campo
              label="Franquia (R$)"
              tipo="number"
              valor={form.franquia}
              onChange={(v) => set('franquia', v)}
            />
            <div className="hidden sm:block" />
            <Campo
              label="Valor do aparelho — mín. (R$)"
              tipo="number"
              valor={form.valorAparelhoMin}
              onChange={(v) => set('valorAparelhoMin', v)}
            />
            <Campo
              label="Valor do aparelho — máx. (R$)"
              tipo="number"
              valor={form.valorAparelhoMax}
              onChange={(v) => set('valorAparelhoMax', v)}
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
