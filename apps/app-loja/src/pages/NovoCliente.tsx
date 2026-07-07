import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Header';
import { apiFetch, ApiError } from '../lib/api';
import { apenasDigitos, imeiValido } from '../lib/imei';

interface ClienteCriado {
  id: string;
}

function mascararCpf(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function mascararTelefone(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function NovoCliente() {
  const navigate = useNavigate();

  // Dados do cliente
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [nascimento, setNascimento] = useState('');

  // Dados do aparelho
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [armazenamento, setArmazenamento] = useState('');
  const [cor, setCor] = useState('');
  const [imei, setImei] = useState('');
  const [valor, setValor] = useState('');

  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const imeiDigitos = useMemo(() => apenasDigitos(imei), [imei]);
  const imeiOk = useMemo(() => imeiValido(imei), [imei]);
  const imeiTocado = imeiDigitos.length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErros([]);

    const cpfDigitos = apenasDigitos(cpf);
    const telDigitos = apenasDigitos(telefone);
    const valorNum = Number(valor.replace(',', '.'));

    // Validações rápidas no cliente antes de chamar a API.
    const locais: string[] = [];
    if (cpfDigitos.length !== 11) locais.push('CPF deve ter 11 dígitos.');
    if (telDigitos.length < 10) locais.push('Telefone (WhatsApp) inválido.');
    if (!imeiOk) locais.push('IMEI inválido (15 dígitos + dígito verificador).');
    const gb = Number(armazenamento);
    if (!Number.isInteger(gb) || gb <= 0) locais.push('Informe o armazenamento em GB.');
    if (!Number.isFinite(valorNum) || valorNum <= 0)
      locais.push('Informe o valor de mercado do aparelho.');
    if (locais.length) {
      setErros(locais);
      return;
    }

    setEnviando(true);
    try {
      // 1) cria o cliente
      const cliente = await apiFetch<ClienteCriado>('/clientes', {
        method: 'POST',
        body: {
          nome: nome.trim(),
          cpf: cpfDigitos,
          telefoneWhatsapp: telDigitos,
          email: email.trim() || undefined,
          nascimento: nascimento || undefined,
        },
      });

      // 2) cria o aparelho vinculado ao cliente recém-criado
      await apiFetch('/aparelhos', {
        method: 'POST',
        body: {
          marca: marca.trim(),
          modelo: modelo.trim(),
          armazenamentoGb: Number(armazenamento),
          cor: cor.trim() || undefined,
          imei: imeiDigitos,
          valorMercado: valorNum,
          clienteId: cliente.id,
        },
      });

      navigate('/clientes', { replace: true });
    } catch (err) {
      setErros([err instanceof ApiError ? err.message : 'Erro ao salvar. Tente novamente.']);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen pb-8">
      <Header titulo="Novo cliente" voltar />

      <main className="mx-auto max-w-app px-4 py-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <section className="card">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
              Dados do cliente
            </h2>

            <div className="mb-3">
              <label htmlFor="nome" className="rotulo">
                Nome completo
              </label>
              <input
                id="nome"
                className="campo"
                required
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="cpf" className="rotulo">
                CPF
              </label>
              <input
                id="cpf"
                className="campo"
                required
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(mascararCpf(e.target.value))}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="tel" className="rotulo">
                WhatsApp
              </label>
              <input
                id="tel"
                className="campo"
                required
                inputMode="tel"
                placeholder="(00) 00000-0000"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              />
            </div>

            <div className="mb-3">
              <label htmlFor="email" className="rotulo">
                E-mail <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id="email"
                type="email"
                className="campo"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="nasc" className="rotulo">
                Nascimento <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id="nasc"
                type="date"
                className="campo"
                value={nascimento}
                onChange={(e) => setNascimento(e.target.value)}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
              Aparelho
            </h2>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="marca" className="rotulo">
                  Marca
                </label>
                <input
                  id="marca"
                  className="campo"
                  required
                  placeholder="Apple"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="modelo" className="rotulo">
                  Modelo
                </label>
                <input
                  id="modelo"
                  className="campo"
                  required
                  placeholder="iPhone 13"
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="gb" className="rotulo">
                  Armazenamento (GB)
                </label>
                <input
                  id="gb"
                  className="campo"
                  required
                  inputMode="numeric"
                  placeholder="128"
                  value={armazenamento}
                  onChange={(e) => setArmazenamento(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div>
                <label htmlFor="cor" className="rotulo">
                  Cor <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  id="cor"
                  className="campo"
                  placeholder="Azul"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="imei" className="rotulo">
                IMEI <span className="font-normal text-slate-400">(disque *#06#)</span>
              </label>
              <div className="relative">
                <input
                  id="imei"
                  className="campo pr-11 font-mono tracking-wide"
                  required
                  inputMode="numeric"
                  maxLength={17}
                  placeholder="15 dígitos"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                />
                {imeiTocado && (
                  <span
                    className={`absolute right-4 top-1/2 -translate-y-1/2 text-xl font-bold ${
                      imeiOk ? 'text-sol-verde' : 'text-red-500'
                    }`}
                    aria-hidden
                  >
                    {imeiOk ? '✓' : '✗'}
                  </span>
                )}
              </div>
              {imeiTocado && (
                <p
                  className={`mt-1 text-xs ${imeiOk ? 'text-sol-verde' : 'text-red-500'}`}
                  aria-live="polite"
                >
                  {imeiOk ? 'IMEI válido.' : `IMEI inválido — ${imeiDigitos.length}/15 dígitos.`}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="valor" className="rotulo">
                Valor de mercado (R$)
              </label>
              <input
                id="valor"
                className="campo"
                required
                inputMode="decimal"
                placeholder="3500,00"
                value={valor}
                onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
              />
            </div>
          </section>

          {erros.length > 0 && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <ul className="list-inside list-disc space-y-1">
                {erros.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <button type="submit" disabled={enviando} className="btn-verde">
            {enviando ? 'Salvando…' : 'Salvar cliente e aparelho'}
          </button>
        </form>
      </main>
    </div>
  );
}
