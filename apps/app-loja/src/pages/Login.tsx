import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export function Login() {
  const { entrar, usuario, carregando } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Já autenticado → vai direto para a home.
  if (!carregando && usuario) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro('');
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErro(
          err.statusCode === 401
            ? 'E-mail ou senha incorretos.'
            : err.message || 'Não foi possível entrar.',
        );
      } else {
        setErro('Não foi possível conectar. Verifique sua internet.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sol-azul px-5">
      <div className="w-full max-w-app">
        <div className="mb-8 text-center text-white">
          <img src="/icon.svg" alt="" className="mx-auto mb-4 h-20 w-20" />
          <h1 className="text-2xl font-bold">Proteção Solatium</h1>
          <p className="mt-1 text-white/70">Acesso do vendedor</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-3xl bg-white p-6 shadow-xl">
          <div className="mb-4">
            <label htmlFor="email" className="rotulo">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              className="campo"
              placeholder="voce@loja.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="mb-2">
            <label htmlFor="senha" className="rotulo">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              required
              className="campo"
              placeholder="••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>

          {erro && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {erro}
            </p>
          )}

          <button type="submit" disabled={enviando} className="btn-primary mt-6">
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
