import { useState } from 'react';
import type { FormEvent } from 'react';
import { LojaStatus } from '@solatium/shared';
import DataTable from '../components/DataTable';
import type { Coluna } from '../components/DataTable';
import Modal from '../components/Modal';
import { Campo, CampoSelect } from '../components/Campo';
import { usePaginado } from '../lib/usePaginado';
import { api, ApiError } from '../lib/api';
import type { Loja } from '../lib/types';
import {
  btnPerigo,
  btnPrimary,
  btnLink,
  btnSecundario,
  formatarCnpj,
  formatarPct,
} from '../lib/ui';

interface LojaForm {
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  responsavelNome: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  bancoNome: string;
  bancoAgencia: string;
  bancoConta: string;
  bancoTipoConta: string;
  pixChave: string;
  comissaoPct: string;
}

const formVazio: LojaForm = {
  nome: '',
  cnpj: '',
  email: '',
  telefone: '',
  responsavelNome: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  cidade: '',
  uf: '',
  bancoNome: '',
  bancoAgencia: '',
  bancoConta: '',
  bancoTipoConta: '',
  pixChave: '',
  comissaoPct: '',
};

function corStatus(status?: LojaStatus): string {
  if (status === LojaStatus.ATIVA) return 'bg-green-100 text-green-700';
  if (status === LojaStatus.INATIVA) return 'bg-slate-200 text-slate-600';
  return 'bg-amber-100 text-amber-700';
}

export default function Lojas() {
  const lista = usePaginado<Loja>('lojas');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Loja | null>(null);
  const [form, setForm] = useState<LojaForm>(formVazio);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirCriacao(): void {
    setEditando(null);
    setForm(formVazio);
    setErroForm(null);
    setModalAberto(true);
  }

  function abrirEdicao(loja: Loja): void {
    setEditando(loja);
    setForm({
      nome: loja.nome ?? '',
      cnpj: loja.cnpj ?? '',
      email: loja.email ?? '',
      telefone: loja.telefone ?? '',
      responsavelNome: loja.responsavelNome ?? '',
      cep: loja.cep ?? '',
      logradouro: loja.logradouro ?? '',
      numero: loja.numero ?? '',
      bairro: loja.bairro ?? '',
      cidade: loja.cidade ?? '',
      uf: loja.uf ?? '',
      bancoNome: loja.bancoNome ?? '',
      bancoAgencia: loja.bancoAgencia ?? '',
      bancoConta: loja.bancoConta ?? '',
      bancoTipoConta: loja.bancoTipoConta ?? '',
      pixChave: loja.pixChave ?? '',
      comissaoPct: loja.comissaoPct != null ? String(loja.comissaoPct * 100) : '',
    });
    setErroForm(null);
    setModalAberto(true);
  }

  function set<K extends keyof LojaForm>(campo: K, valor: string): void {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function montarBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      nome: form.nome.trim(),
      cnpj: form.cnpj.replace(/\D/g, ''),
    };
    const opcionais: (keyof LojaForm)[] = [
      'email',
      'telefone',
      'responsavelNome',
      'cep',
      'logradouro',
      'numero',
      'bairro',
      'cidade',
      'uf',
      'bancoNome',
      'bancoAgencia',
      'bancoConta',
      'bancoTipoConta',
      'pixChave',
    ];
    for (const campo of opcionais) {
      const valor = form[campo].trim();
      if (valor) body[campo] = valor;
    }
    if (form.comissaoPct.trim()) {
      body.comissaoPct = Number(form.comissaoPct) / 100;
    }
    return body;
  }

  async function salvar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      const body = montarBody();
      if (editando) {
        await api.atualizar('lojas', editando.id, body);
      } else {
        await api.criar('lojas', body);
      }
      setModalAberto(false);
      await lista.recarregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : 'Erro ao salvar a loja.');
    } finally {
      setSalvando(false);
    }
  }

  async function inativar(loja: Loja): Promise<void> {
    if (!window.confirm(`Inativar a loja "${loja.nome}"?`)) return;
    try {
      await api.remover('lojas', loja.id);
      await lista.recarregar();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Erro ao inativar a loja.');
    }
  }

  const colunas: Coluna<Loja>[] = [
    { titulo: 'Nome', render: (l) => <span className="font-medium text-slate-800">{l.nome}</span> },
    { titulo: 'CNPJ', render: (l) => formatarCnpj(l.cnpj) },
    { titulo: 'Cidade/UF', render: (l) => [l.cidade, l.uf].filter(Boolean).join(' / ') || '—' },
    { titulo: 'Comissão', render: (l) => formatarPct(l.comissaoPct) },
    {
      titulo: 'Status',
      render: (l) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corStatus(l.status)}`}>
          {l.status ?? '—'}
        </span>
      ),
    },
    {
      titulo: 'Ações',
      className: 'text-right',
      render: (l) => (
        <div className="flex justify-end gap-3">
          <button type="button" className={btnLink} onClick={() => abrirEdicao(l)}>
            Editar
          </button>
          <button type="button" className={btnPerigo} onClick={() => void inativar(l)}>
            Inativar
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        titulo="Lojas"
        colunas={colunas}
        dados={lista.itens}
        chave={(l) => l.id}
        carregando={lista.carregando}
        erro={lista.erro}
        busca={lista.busca}
        onBusca={lista.mudarBusca}
        buscaPlaceholder="Buscar por nome, CNPJ ou cidade…"
        pagina={lista.pagina}
        porPagina={lista.porPagina}
        total={lista.total}
        onPagina={lista.setPagina}
        acoes={
          <button type="button" className={btnPrimary} onClick={abrirCriacao}>
            Nova loja
          </button>
        }
      />

      <Modal
        aberto={modalAberto}
        titulo={editando ? 'Editar loja' : 'Nova loja'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome" valor={form.nome} onChange={(v) => set('nome', v)} obrigatorio />
            <Campo
              label="CNPJ (14 dígitos)"
              valor={form.cnpj}
              onChange={(v) => set('cnpj', v)}
              obrigatorio
              placeholder="12345678000199"
            />
            <Campo
              label="E-mail"
              tipo="email"
              valor={form.email}
              onChange={(v) => set('email', v)}
            />
            <Campo label="Telefone" valor={form.telefone} onChange={(v) => set('telefone', v)} />
            <Campo
              label="Responsável"
              valor={form.responsavelNome}
              onChange={(v) => set('responsavelNome', v)}
              className="sm:col-span-2"
            />
          </div>

          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold text-slate-600">Endereço</legend>
            <Campo label="CEP" valor={form.cep} onChange={(v) => set('cep', v)} />
            <Campo
              label="Logradouro"
              valor={form.logradouro}
              onChange={(v) => set('logradouro', v)}
              className="sm:col-span-2"
            />
            <Campo label="Número" valor={form.numero} onChange={(v) => set('numero', v)} />
            <Campo label="Bairro" valor={form.bairro} onChange={(v) => set('bairro', v)} />
            <Campo label="Cidade" valor={form.cidade} onChange={(v) => set('cidade', v)} />
            <Campo label="UF" valor={form.uf} onChange={(v) => set('uf', v)} placeholder="SP" />
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold text-slate-600">
              Dados bancários / comissão
            </legend>
            <Campo label="Banco" valor={form.bancoNome} onChange={(v) => set('bancoNome', v)} />
            <Campo
              label="Agência"
              valor={form.bancoAgencia}
              onChange={(v) => set('bancoAgencia', v)}
            />
            <Campo label="Conta" valor={form.bancoConta} onChange={(v) => set('bancoConta', v)} />
            <CampoSelect
              label="Tipo de conta"
              valor={form.bancoTipoConta}
              onChange={(v) => set('bancoTipoConta', v)}
              placeholder="Selecione…"
              opcoes={[
                { valor: 'CORRENTE', rotulo: 'Corrente' },
                { valor: 'POUPANCA', rotulo: 'Poupança' },
              ]}
            />
            <Campo label="Chave PIX" valor={form.pixChave} onChange={(v) => set('pixChave', v)} />
            <Campo
              label="Comissão (%)"
              tipo="number"
              valor={form.comissaoPct}
              onChange={(v) => set('comissaoPct', v)}
              placeholder="30"
            />
          </fieldset>

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
