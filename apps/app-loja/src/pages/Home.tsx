import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { useAuth } from '../lib/auth';

interface AtalhoProps {
  titulo: string;
  descricao: string;
  emoji: string;
  variante: 'verde' | 'azul' | 'cinza';
  onClick: () => void;
}

function Atalho({ titulo, descricao, emoji, variante, onClick }: AtalhoProps) {
  const cor =
    variante === 'verde'
      ? 'bg-sol-verde text-white'
      : variante === 'azul'
        ? 'bg-sol-azul text-white'
        : 'bg-white text-slate-900 border border-slate-200';
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-2xl p-5 text-left shadow-sm transition active:scale-[0.99] ${cor}`}
    >
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold">{titulo}</span>
        <span
          className={`block text-sm ${variante === 'cinza' ? 'text-slate-500' : 'text-white/80'}`}
        >
          {descricao}
        </span>
      </span>
    </button>
  );
}

export function Home() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const primeiroNome = usuario?.nome.split(' ')[0] ?? 'Vendedor';

  return (
    <div className="min-h-screen">
      <Header titulo="Início" />

      <main className="mx-auto max-w-app px-4 py-5">
        <p className="mb-5 text-slate-600">
          Olá, <span className="font-semibold text-slate-900">{primeiroNome}</span> 👋
        </p>

        <div className="flex flex-col gap-3">
          <Atalho
            titulo="Nova Proteção"
            descricao="Vistoria + emissão do certificado"
            emoji="🛡️"
            variante="verde"
            onClick={() =>
              window.alert('Fluxo de Nova Proteção (vistoria e pagamento) chega em breve.')
            }
          />
          <Atalho
            titulo="Meus Clientes"
            descricao="Buscar e cadastrar clientes"
            emoji="👥"
            variante="azul"
            onClick={() => navigate('/clientes')}
          />
          <Atalho
            titulo="Minhas Vendas"
            descricao="Comissões e histórico"
            emoji="📈"
            variante="cinza"
            onClick={() => window.alert('Painel de vendas e comissões chega em breve.')}
          />
        </div>
      </main>
    </div>
  );
}
