import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FormaPagamento, type Paginacao } from '@solatium/shared';
import { Header } from '../components/Header';
import { apiFetch, ApiError } from '../lib/api';
import { apenasDigitos, imeiValido } from '../lib/imei';

/* ------------------------------------------------------------------------ */
/* Tipos das respostas usadas no fluxo                                       */
/* ------------------------------------------------------------------------ */

interface Cliente {
  id: string;
  nome: string;
  cpf: string;
}

interface Aparelho {
  id: string;
  marca: string;
  modelo: string;
  imei: string;
}

interface Vistoria {
  id: string;
  status: 'PENDENTE' | 'APROVADA' | 'EM_ANALISE' | 'REPROVADA';
  codigoDinamico: string;
  codigoExpiraEm: string;
}

interface Plano {
  id: string;
  nome: string;
  descricao?: string | null;
  premioMensal?: string | number | null;
  premioAnual?: string | number | null;
  franquiaPercentual?: string | number;
  valorAparelhoMin?: string | number | null;
  valorAparelhoMax?: string | number | null;
  ativo: boolean;
}

interface Checkout {
  status?: string;
  linkPagamento?: string;
  pixCopiaCola?: string;
  pixQrCodeBase64?: string;
  boletoUrl?: string;
}

interface Contrato {
  id: string;
  status: 'AGUARDANDO_PAGAMENTO' | 'ATIVO' | 'CANCELADO';
  formaPagamento: FormaPagamento;
  premioTotal: string | number;
  checkout?: Checkout | null;
  certificado?: { id: string; numero: string; pdfUrl?: string | null; vigenciaFim: string } | null;
}

type Etapa = 'dados' | 'vistoria' | 'plano' | 'pagamento' | 'sucesso';

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

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

function reais(valor: string | number | null | undefined): string {
  const n = Number(valor ?? 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const FORMAS: { valor: FormaPagamento; rotulo: string; detalhe: string }[] = [
  { valor: 'PIX', rotulo: 'Pix', detalhe: 'anual à vista — QR na tela' },
  { valor: 'CARTAO_RECORRENTE', rotulo: 'Cartão mensal', detalhe: 'assinatura recorrente' },
  { valor: 'CARTAO_ANUAL', rotulo: 'Cartão anual', detalhe: 'à vista ou parcelado' },
  { valor: 'BOLETO', rotulo: 'Boleto', detalhe: 'anual à vista' },
];

/* ------------------------------------------------------------------------ */
/* Página                                                                    */
/* ------------------------------------------------------------------------ */

export function NovaProtecao() {
  const [etapa, setEtapa] = useState<Etapa>('dados');
  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

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

  // Estado do fluxo
  const [aparelho, setAparelho] = useState<Aparelho | null>(null);
  const [vistoria, setVistoria] = useState<Vistoria | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [planoId, setPlanoId] = useState('');
  const [forma, setForma] = useState<FormaPagamento>('PIX');
  const [parcelas, setParcelas] = useState(1);
  const [contrato, setContrato] = useState<Contrato | null>(null);

  const imeiDigitos = useMemo(() => apenasDigitos(imei), [imei]);
  const imeiOk = useMemo(() => imeiValido(imei), [imei]);
  const valorNum = useMemo(() => Number(valor.replace(',', '.')), [valor]);

  function falha(err: unknown, fallback: string) {
    setErros([err instanceof ApiError ? err.message : fallback]);
  }

  /* ------------------------- Etapa 1: cliente+aparelho ------------------- */

  /** Reusa cliente existente pelo CPF (2ª venda pro mesmo cliente). */
  async function garantirCliente(cpfDigitos: string, telDigitos: string): Promise<Cliente> {
    try {
      return await apiFetch<Cliente>('/clientes', {
        method: 'POST',
        body: {
          nome: nome.trim(),
          cpf: cpfDigitos,
          telefoneWhatsapp: telDigitos,
          email: email.trim() || undefined,
          nascimento: nascimento || undefined,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        const pagina = await apiFetch<Paginacao<Cliente>>('/clientes', {
          query: { busca: cpfDigitos, porPagina: 1 },
        });
        const existente = pagina.itens.find((c) => apenasDigitos(c.cpf) === cpfDigitos);
        if (existente) return existente;
      }
      throw err;
    }
  }

  async function submeterDados(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErros([]);

    const cpfDigitos = apenasDigitos(cpf);
    const telDigitos = apenasDigitos(telefone);
    const gb = Number(armazenamento);
    const locais: string[] = [];
    if (cpfDigitos.length !== 11) locais.push('CPF deve ter 11 dígitos.');
    if (telDigitos.length < 10) locais.push('Telefone (WhatsApp) inválido.');
    if (!imeiOk) locais.push('IMEI inválido (15 dígitos + dígito verificador).');
    if (!Number.isInteger(gb) || gb <= 0) locais.push('Informe o armazenamento em GB.');
    if (!Number.isFinite(valorNum) || valorNum <= 0)
      locais.push('Informe o valor de referência do aparelho.');
    if (locais.length) return setErros(locais);

    setEnviando(true);
    try {
      const cliente = await garantirCliente(cpfDigitos, telDigitos);
      const criado = await apiFetch<Aparelho>('/aparelhos', {
        method: 'POST',
        body: {
          marca: marca.trim(),
          modelo: modelo.trim(),
          armazenamentoGb: gb,
          cor: cor.trim() || undefined,
          imei: imeiDigitos,
          valorMercado: valorNum,
          clienteId: cliente.id,
        },
      });
      setAparelho(criado);
      const vist = await apiFetch<Vistoria>('/vistorias', {
        method: 'POST',
        body: { aparelhoId: criado.id },
      });
      setVistoria(vist);
      setEtapa('vistoria');
    } catch (err) {
      falha(err, 'Erro ao salvar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  /* ------------------------- Etapa 2: vistoria --------------------------- */

  async function aprovarVistoria() {
    if (!vistoria || enviando) return;
    setErros([]);
    setEnviando(true);
    try {
      const aprovada = await apiFetch<Vistoria>(`/vistorias/${vistoria.id}/aprovar`, {
        method: 'POST',
      });
      setVistoria(aprovada);
      const pagina = await apiFetch<Paginacao<Plano>>('/planos', { query: { porPagina: 100 } });
      const elegiveis = pagina.itens.filter((p) => {
        if (!p.ativo) return false;
        const min = p.valorAparelhoMin != null ? Number(p.valorAparelhoMin) : null;
        const max = p.valorAparelhoMax != null ? Number(p.valorAparelhoMax) : null;
        if (min != null && valorNum < min) return false;
        if (max != null && valorNum > max) return false;
        return true;
      });
      setPlanos(elegiveis);
      if (elegiveis.length === 1) setPlanoId(elegiveis[0].id);
      setEtapa('plano');
    } catch (err) {
      falha(err, 'Erro ao aprovar a vistoria.');
    } finally {
      setEnviando(false);
    }
  }

  /* ------------------------- Etapa 3: plano + pagamento ------------------ */

  const planoEscolhido = planos.find((p) => p.id === planoId) ?? null;

  function precoDaForma(plano: Plano, f: FormaPagamento): string {
    if (f === 'CARTAO_RECORRENTE') {
      return plano.premioMensal ? `${reais(plano.premioMensal)}/mês` : 'sem prêmio mensal';
    }
    return plano.premioAnual ? `${reais(plano.premioAnual)}/ano` : 'sem prêmio anual';
  }

  async function contratar() {
    if (!vistoria || !planoEscolhido || enviando) return;
    setErros([]);
    setEnviando(true);
    try {
      const criado = await apiFetch<Contrato>('/contratos', {
        method: 'POST',
        body: {
          vistoriaId: vistoria.id,
          planoId: planoEscolhido.id,
          formaPagamento: forma,
          parcelas: forma === 'CARTAO_ANUAL' ? parcelas : undefined,
        },
      });
      setContrato(criado);
      setEtapa('pagamento');
    } catch (err) {
      falha(err, 'Erro ao gerar a cobrança.');
    } finally {
      setEnviando(false);
    }
  }

  /* ------------------------- Etapa 4: pagar + polling -------------------- */

  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (etapa !== 'pagamento' || !contrato) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const atual = await apiFetch<Contrato>(`/contratos/${contrato.id}`);
        setContrato(atual);
        if (atual.certificado) {
          setEtapa('sucesso');
        }
      } catch {
        // erro transitório de rede: o próximo tick tenta de novo
      }
    }, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [etapa, contrato?.id]);

  async function trocarParaPix() {
    if (!contrato || enviando) return;
    setErros([]);
    setEnviando(true);
    try {
      const atual = await apiFetch<Contrato>(`/contratos/${contrato.id}/nova-cobranca`, {
        method: 'POST',
        body: { formaPagamento: 'PIX' },
      });
      setContrato(atual);
      setForma('PIX');
    } catch (err) {
      falha(err, 'Erro ao gerar o Pix.');
    } finally {
      setEnviando(false);
    }
  }

  async function copiarPix() {
    const codigo = contrato?.checkout?.pixCopiaCola;
    if (!codigo) return;
    await navigator.clipboard.writeText(codigo);
    window.alert('Código Pix copiado!');
  }

  /* ------------------------------------------------------------------------
   * Render por etapa
   * ---------------------------------------------------------------------- */

  const passos: { chave: Etapa; rotulo: string }[] = [
    { chave: 'dados', rotulo: 'Dados' },
    { chave: 'vistoria', rotulo: 'Vistoria' },
    { chave: 'plano', rotulo: 'Plano' },
    { chave: 'pagamento', rotulo: 'Pagamento' },
    { chave: 'sucesso', rotulo: 'Pronto' },
  ];
  const indiceAtual = passos.findIndex((p) => p.chave === etapa);

  return (
    <div className="min-h-screen pb-8">
      <Header titulo="Nova Proteção" voltar />

      <main className="mx-auto max-w-app px-4 py-4">
        {/* Indicador de progresso */}
        <ol className="mb-5 flex items-center gap-1" aria-label="Etapas">
          {passos.map((p, i) => (
            <li key={p.chave} className="flex-1">
              <div
                className={`h-1.5 rounded-full ${i <= indiceAtual ? 'bg-sol-verde' : 'bg-slate-200'}`}
              />
              <span
                className={`mt-1 block text-center text-[10px] ${
                  i === indiceAtual ? 'font-bold text-slate-900' : 'text-slate-400'
                }`}
              >
                {p.rotulo}
              </span>
            </li>
          ))}
        </ol>

        {erros.length > 0 && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <ul className="list-inside list-disc space-y-1">
              {erros.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ---------------- Etapa 1: dados ---------------- */}
        {etapa === 'dados' && (
          <form onSubmit={submeterDados} className="flex flex-col gap-5" noValidate>
            <section className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                Cliente
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
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
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
                <div>
                  <label htmlFor="nasc" className="rotulo">
                    Nascimento
                  </label>
                  <input
                    id="nasc"
                    type="date"
                    className="campo"
                    value={nascimento}
                    onChange={(e) => setNascimento(e.target.value)}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="tel" className="rotulo">
                  WhatsApp{' '}
                  <span className="font-normal text-slate-400">(recebe o certificado)</span>
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
              <div>
                <label htmlFor="email" className="rotulo">
                  E-mail <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  id="email"
                  type="email"
                  className="campo"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                    placeholder="iPhone 15"
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
                    Cor
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
                <input
                  id="imei"
                  className="campo font-mono tracking-wide"
                  required
                  inputMode="numeric"
                  maxLength={17}
                  placeholder="15 dígitos"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                />
                {imeiDigitos.length > 0 && (
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
                  Valor de referência (R$)
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

            <button type="submit" disabled={enviando} className="btn-verde">
              {enviando ? 'Salvando…' : 'Iniciar vistoria'}
            </button>
          </form>
        )}

        {/* ---------------- Etapa 2: vistoria ---------------- */}
        {etapa === 'vistoria' && vistoria && (
          <div className="flex flex-col gap-5">
            <section className="card text-center">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
                Código de vistoria
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                Digite este código em uma nota no aparelho do cliente e confira que a tela liga e
                responde. Válido por 10 minutos.
              </p>
              <div className="mx-auto mb-3 w-fit rounded-2xl bg-sol-azul px-8 py-4 font-mono text-4xl font-bold tracking-[0.3em] text-white">
                {vistoria.codigoDinamico}
              </div>
              <p className="text-xs text-slate-500">
                Aparelho: {aparelho?.marca} {aparelho?.modelo} — IMEI final{' '}
                {aparelho?.imei.slice(-4)}
              </p>
            </section>

            <button onClick={aprovarVistoria} disabled={enviando} className="btn-verde">
              {enviando ? 'Aprovando…' : 'Aparelho conferido — aprovar vistoria'}
            </button>
          </div>
        )}

        {/* ---------------- Etapa 3: plano + forma ---------------- */}
        {etapa === 'plano' && (
          <div className="flex flex-col gap-5">
            <section className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                Plano
              </h2>
              {planos.length === 0 && (
                <p className="text-sm text-red-600">
                  Nenhum plano ativo cobre um aparelho de {reais(valorNum)}. Fale com o admin.
                </p>
              )}
              <div className="flex flex-col gap-2">
                {planos.map((p) => (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${
                      planoId === p.id ? 'border-sol-verde bg-sol-verde/5' : 'border-slate-200'
                    }`}
                  >
                    <span>
                      <span className="block font-semibold">{p.nome}</span>
                      <span className="block text-xs text-slate-500">
                        {p.premioMensal ? `${reais(p.premioMensal)}/mês` : ''}
                        {p.premioMensal && p.premioAnual ? ' · ' : ''}
                        {p.premioAnual ? `${reais(p.premioAnual)}/ano` : ''}
                        {` · franquia ${Number(p.franquiaPercentual ?? 25)}%`}
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="plano"
                      checked={planoId === p.id}
                      onChange={() => setPlanoId(p.id)}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                Forma de pagamento
              </h2>
              <div className="flex flex-col gap-2">
                {FORMAS.map((f) => (
                  <label
                    key={f.valor}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${
                      forma === f.valor ? 'border-sol-verde bg-sol-verde/5' : 'border-slate-200'
                    }`}
                  >
                    <span>
                      <span className="block font-semibold">{f.rotulo}</span>
                      <span className="block text-xs text-slate-500">
                        {f.detalhe}
                        {planoEscolhido ? ` · ${precoDaForma(planoEscolhido, f.valor)}` : ''}
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="forma"
                      checked={forma === f.valor}
                      onChange={() => setForma(f.valor)}
                    />
                  </label>
                ))}
              </div>
              {forma === 'CARTAO_ANUAL' && (
                <div className="mt-3">
                  <label htmlFor="parcelas" className="rotulo">
                    Parcelas
                  </label>
                  <select
                    id="parcelas"
                    className="campo"
                    value={parcelas}
                    onChange={(e) => setParcelas(Number(e.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}x
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            <button
              onClick={contratar}
              disabled={enviando || !planoEscolhido}
              className="btn-verde"
            >
              {enviando ? 'Gerando cobrança…' : 'Gerar cobrança'}
            </button>
          </div>
        )}

        {/* ---------------- Etapa 4: pagamento ---------------- */}
        {etapa === 'pagamento' && contrato && (
          <div className="flex flex-col gap-5">
            <section className="card text-center">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
                {contrato.formaPagamento === 'PIX' ? 'Pague com Pix' : 'Pagamento'}
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                Total: <strong>{reais(contrato.premioTotal)}</strong> — aguardando confirmação…
              </p>

              {contrato.checkout?.pixQrCodeBase64 && (
                <img
                  src={`data:image/png;base64,${contrato.checkout.pixQrCodeBase64}`}
                  alt="QR Code Pix"
                  className="mx-auto mb-3 w-56 rounded-xl border border-slate-200"
                />
              )}

              {contrato.checkout?.pixCopiaCola && (
                <button
                  onClick={copiarPix}
                  className="mb-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold"
                >
                  📋 Copiar código Pix (copia e cola)
                </button>
              )}

              {contrato.checkout?.linkPagamento && contrato.formaPagamento !== 'PIX' && (
                <a
                  href={contrato.checkout.linkPagamento}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-verde block"
                >
                  Abrir página de pagamento
                </a>
              )}

              {contrato.checkout?.boletoUrl && (
                <a
                  href={contrato.checkout.boletoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block text-sm font-semibold text-sol-azul underline"
                >
                  Ver boleto
                </a>
              )}

              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sol-verde" />
                Assim que o pagamento confirmar, o certificado é emitido e enviado no WhatsApp
                automaticamente.
              </div>
            </section>

            {(contrato.formaPagamento === 'CARTAO_RECORRENTE' ||
              contrato.formaPagamento === 'CARTAO_ANUAL' ||
              contrato.formaPagamento === 'BOLETO') && (
              <button
                onClick={trocarParaPix}
                disabled={enviando}
                className="rounded-xl border border-sol-azul px-4 py-3 text-sm font-semibold text-sol-azul"
              >
                {enviando ? 'Gerando…' : 'Cartão recusado? Pagar com Pix'}
              </button>
            )}
          </div>
        )}

        {/* ---------------- Etapa 5: sucesso ---------------- */}
        {etapa === 'sucesso' && contrato?.certificado && (
          <div className="flex flex-col gap-5">
            <section className="card text-center">
              <div className="mb-2 text-5xl" aria-hidden>
                🎉
              </div>
              <h2 className="mb-1 text-lg font-bold text-slate-900">Aparelho protegido!</h2>
              <p className="mb-3 text-sm text-slate-600">
                Certificado <strong>{contrato.certificado.numero}</strong> emitido e enviado no
                WhatsApp {email ? 'e no e-mail ' : ''}do cliente.
              </p>
              {contrato.certificado.pdfUrl &&
                !contrato.certificado.pdfUrl.startsWith('stub://') && (
                  <a
                    href={contrato.certificado.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-sol-azul underline"
                  >
                    Ver PDF do certificado
                  </a>
                )}
            </section>
            <button onClick={() => window.location.assign('/protecao/nova')} className="btn-verde">
              Nova venda
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
