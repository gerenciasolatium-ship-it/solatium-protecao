import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import DataTable from '../components/DataTable';
import type { Coluna } from '../components/DataTable';
import Modal from '../components/Modal';
import ImportCsvModal from '../components/ImportCsvModal';
import { Campo, CampoSelect } from '../components/Campo';
import { usePaginado } from '../lib/usePaginado';
import { api, ApiError } from '../lib/api';
import type { Loja, Vendedor } from '../lib/types';
import { btnPerigo, btnPrimary, btnLink, btnSecundario, formatarCpf } from '../lib/ui';

interface VendedorForm {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  lojaId: string;
  senha: string;
}

const formVazio: VendedorForm = {
  nome: '',
  cpf: '',
  telefone: '',
  email: '',
  lojaId: '',
  senha: '',
};

export default function Vendedores() {
  const lista = usePaginado<Vendedor>('vendedores');
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [importAberto, setImportAberto] = useState(false);
  const [editando, setEditando] = useState<Vendedor | null>(null);
  const [form, setForm] = useState<VendedorForm>(formVazio);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Carrega as lojas (até 100) para o seletor e para exibir o nome na tabela.
  useEffect(() => {
    let ativo = true;
    api
      .listar<Loja>('lojas', { pagina: 1, porPagina: 100 })
      .then((r) => {
        if (ativo) setLojas(r.itens);
      })
      .catch(() => {
        if (ativo) setLojas([]);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const nomeLoja = (lojaId: string): string => lojas.find((l) => l.id === lojaId)?.nome ?? lojaId;

  function abrirCriacao(): void {
    setEditando(null);
    setForm(formVazio);
    setErroForm(null);
    setModalAberto(true);
  }

  function abrirEdicao(v: Vendedor): void {
    setEditando(v);
    setForm({
      nome: v.nome ?? '',
      cpf: v.cpf ?? '',
      telefone: v.telefone ?? '',
      email: v.email ?? '',
      lojaId: v.lojaId ?? '',
      senha: '',
    });
    setErroForm(null);
    setModalAberto(true);
  }

  function set<K extends keyof VendedorForm>(campo: K, valor: string): void {
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
        lojaId: form.lojaId,
      };
      if (form.telefone.trim()) body.telefone = form.telefone.trim();
      if (form.email.trim()) body.email = form.email.trim();
      if (form.senha.trim()) body.senha = form.senha;

      if (editando) {
        await api.atualizar('vendedores', editando.id, body);
      } else {
        await api.criar('vendedores', body);
      }
      setModalAberto(false);
      await lista.recarregar();
    } catch (err) {
      setErroForm(err instanceof ApiError ? err.message : 'Erro ao salvar o vendedor.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(v: Vendedor): Promise<void> {
    if (!window.confirm(`Excluir/inativar o vendedor "${v.nome}"?`)) return;
    try {
      await api.remover('vendedores', v.id);
      await lista.recarregar();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : 'Erro ao excluir o vendedor.');
    }
  }

  const colunas: Coluna<Vendedor>[] = [
    { titulo: 'Nome', render: (v) => <span className="font-medium text-slate-800">{v.nome}</span> },
    { titulo: 'CPF', render: (v) => formatarCpf(v.cpf) },
    { titulo: 'Telefone', render: (v) => v.telefone || '—' },
    { titulo: 'Loja', render: (v) => nomeLoja(v.lojaId) },
    {
      titulo: 'Ações',
      className: 'text-right',
      render: (v) => (
        <div className="flex justify-end gap-3">
          <button type="button" className={btnLink} onClick={() => abrirEdicao(v)}>
            Editar
          </button>
          <button type="button" className={btnPerigo} onClick={() => void excluir(v)}>
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        titulo="Vendedores"
        colunas={colunas}
        dados={lista.itens}
        chave={(v) => v.id}
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
          <div className="flex gap-2">
            <button type="button" className={btnSecundario} onClick={() => setImportAberto(true)}>
              Importar CSV
            </button>
            <button type="button" className={btnPrimary} onClick={abrirCriacao}>
              Novo vendedor
            </button>
          </div>
        }
      />

      <ImportCsvModal
        aberto={importAberto}
        onFechar={() => setImportAberto(false)}
        titulo="Importar vendedores em massa"
        endpoint="/vendedores/importar"
        colunas={['nome', 'cpf', 'loja_cnpj', 'telefone', 'email', 'senha']}
        extra={{
          chave: 'senhaPadrao',
          rotulo: 'Senha inicial padrão (usada nas linhas sem coluna senha)',
        }}
        onImportou={() => void lista.recarregar()}
      />

      <Modal
        aberto={modalAberto}
        titulo={editando ? 'Editar vendedor' : 'Novo vendedor'}
        onFechar={() => setModalAberto(false)}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nome" valor={form.nome} onChange={(v) => set('nome', v)} obrigatorio />
            <Campo label="CPF" valor={form.cpf} onChange={(v) => set('cpf', v)} obrigatorio />
            <Campo label="Telefone" valor={form.telefone} onChange={(v) => set('telefone', v)} />
            <Campo
              label="E-mail"
              tipo="email"
              valor={form.email}
              onChange={(v) => set('email', v)}
            />
            <CampoSelect
              label="Loja"
              valor={form.lojaId}
              onChange={(v) => set('lojaId', v)}
              obrigatorio
              placeholder="Selecione a loja…"
              opcoes={lojas.map((l) => ({ valor: l.id, rotulo: l.nome }))}
              className="sm:col-span-2"
            />
            <Campo
              label={editando ? 'Nova senha (deixe em branco para manter)' : 'Senha de acesso'}
              tipo="password"
              valor={form.senha}
              onChange={(v) => set('senha', v)}
              obrigatorio={!editando}
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
