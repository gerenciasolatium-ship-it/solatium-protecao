import { useState } from 'react';
import type { FormEvent } from 'react';
import DataTable from '../components/DataTable';
import type { Coluna } from '../components/DataTable';
import Modal from '../components/Modal';
import { Campo } from '../components/Campo';
import { usePaginado } from '../lib/usePaginado';
import { api, ApiError } from '../lib/api';
import type { Cliente } from '../lib/types';
import { btnPrimary, btnSecundario, formatarCpf } from '../lib/ui';

interface ClienteForm {
  nome: string;
  cpf: string;
  telefoneWhatsapp: string;
  email: string;
}

const formVazio: ClienteForm = {
  nome: '',
  cpf: '',
  telefoneWhatsapp: '',
  email: '',
};

// Obs.: o contrato de clientes expõe apenas GET (listagem) e POST (criação),
// portanto esta página não oferece edição/exclusão.
export default function Clientes() {
  const lista = usePaginado<Cliente>('clientes');
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<ClienteForm>(formVazio);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirCriacao(): void {
    setForm(formVazio);
    setErroForm(null);
    setModalAberto(true);
  }

  function set<K extends keyof ClienteForm>(campo: K, valor: string): void {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function salvar(e: FormEvent): Promise<void> {
    e.preventDefault();
    setErroForm(null);
    setSalvando(true);
    try {
      const body: Record<string, unknown> = {
        nome: form.nome.trim(),
        cpf: form.cpf.replace(/\D/g, ''),
        telefoneWhatsapp: form.telefoneWhatsapp.trim(),
      };
      if (form.email.trim()) body.email = form.email.trim();

      await api.criar('clientes', body);
      setModalAberto(false);
      await lista.recarregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : 'Erro ao salvar o cliente.');
    } finally {
      setSalvando(false);
    }
  }

  const colunas: Coluna<Cliente>[] = [
    { titulo: 'Nome', render: (c) => <span className="font-medium text-slate-800">{c.nome}</span> },
    { titulo: 'CPF', render: (c) => formatarCpf(c.cpf) },
    { titulo: 'WhatsApp', render: (c) => c.telefoneWhatsapp || '—' },
    { titulo: 'E-mail', render: (c) => c.email || '—' },
  ];

  return (
    <>
      <DataTable
        titulo="Clientes"
        colunas={colunas}
        dados={lista.itens}
        chave={(c) => c.id}
        carregando={lista.carregando}
        erro={lista.erro}
        busca={lista.busca}
        onBusca={lista.mudarBusca}
        buscaPlaceholder="Buscar por nome ou CPF…"
        pagina={lista.pagina}
        porPagina={lista.porPagina}
        total={lista.total}
        onPagina={lista.setPagina}
        acoes={
          <button type="button" className={btnPrimary} onClick={abrirCriacao}>
            Novo cliente
          </button>
        }
      />

      <Modal aberto={modalAberto} titulo="Novo cliente" onFechar={() => setModalAberto(false)}>
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              label="Nome"
              valor={form.nome}
              onChange={(v) => set('nome', v)}
              obrigatorio
              className="sm:col-span-2"
            />
            <Campo label="CPF" valor={form.cpf} onChange={(v) => set('cpf', v)} obrigatorio />
            <Campo
              label="WhatsApp"
              valor={form.telefoneWhatsapp}
              onChange={(v) => set('telefoneWhatsapp', v)}
              obrigatorio
              placeholder="11999999999"
            />
            <Campo
              label="E-mail"
              tipo="email"
              valor={form.email}
              onChange={(v) => set('email', v)}
              className="sm:col-span-2"
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
