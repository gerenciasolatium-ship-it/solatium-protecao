import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FormaPagamento, type Paginacao } from '@solatium/shared';
import { Header } from '../components/Header';
import { apiFetch, ApiError } from '../lib/api';
import { apenasDigitos, imeiValido } from '../lib/imei';
import { cpfValido } from '../lib/cpf';

/* ------------------------------------------------------------------------ */
/* Tipos das respostas usadas no fluxo                                       */
/* ------------------------------------------------------------------------ */

interface Cliente {
  id: string;
  nome: string;
  cpf: string;
  telefoneWhatsapp?: string | null;
  email?: string | null;
  nascimento?: string | null;
}

/** Proposta criada pelo CRM do parceiro via API (M11) — abre o wizard preenchido. */
interface PropostaExterna {
  codigo: string;
  referenciaExterna?: string | null;
  payload: {
    cliente: {
      nome: string;
      cpf: string;
      telefoneWhatsapp: string;
      email?: string | null;
      nascimento?: string | null;
    };
    aparelho?: {
      marca?: string | null;
      modelo?: string | null;
      armazenamentoGb?: number | null;
      cor?: string | null;
      imei?: string | null;
      valorMercado?: number | null;
    } | null;
  };
}

interface ModeloCatalogo {
  id: string;
  marca: string;
  modelo: string;
  armazenamentoGb: number;
  valorReferencia: string | number;
  ativo?: boolean;
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
  tokenExpiraEm?: string | null;
  linkEnviadoEm?: string | null;
  motivoReprova?: string | null;
  cliente?: { nome: string; telefoneWhatsapp: string } | null;
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
  /** 'PIX' quando esta cobrança nasceu do fallback automático Pix→boleto. */
  fallbackDe?: string;
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

/** Converte o decimal da API ("3500.00") para o formato do campo ("3500,00"). */
function valorEmCampo(v: string | number): string {
  return Number(v).toFixed(2).replace('.', ',');
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
  const [avisoCpf, setAvisoCpf] = useState<string | null>(null);
  const [buscandoCpf, setBuscandoCpf] = useState(false);
  const [avisoImei, setAvisoImei] = useState<string | null>(null);
  const [propostaCodigo, setPropostaCodigo] = useState<string | null>(null);

  // Dados do aparelho
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [armazenamento, setArmazenamento] = useState('');
  const [cor, setCor] = useState('');
  const [imei, setImei] = useState('');
  const [valor, setValor] = useState('');
  const [catalogo, setCatalogo] = useState<ModeloCatalogo[]>([]);
  const [aparelhoManual, setAparelhoManual] = useState(false);

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

  /* --------------- Proposta do CRM do parceiro (link pré-preenchido) ----- */

  // último CPF já buscado em /clientes (evita refetch e sobrescrita indevida)
  const cpfBuscadoRef = useRef('');
  const [searchParams] = useSearchParams();
  const propostaUrl = searchParams.get('proposta');
  useEffect(() => {
    if (!propostaUrl) return;
    let cancelado = false;
    (async () => {
      try {
        const proposta = await apiFetch<PropostaExterna>(`/propostas-externas/${propostaUrl}`);
        if (cancelado) return;
        const { cliente, aparelho } = proposta.payload;
        // evita que o autofill por CPF sobrescreva os dados vindos do CRM
        cpfBuscadoRef.current = apenasDigitos(cliente.cpf);
        setNome(cliente.nome);
        setCpf(mascararCpf(cliente.cpf));
        setTelefone(mascararTelefone(cliente.telefoneWhatsapp));
        if (cliente.email) setEmail(cliente.email);
        if (cliente.nascimento) setNascimento(cliente.nascimento.slice(0, 10));
        if (aparelho) {
          setAparelhoManual(true); // dados do CRM podem estar fora do catálogo
          if (aparelho.marca) setMarca(aparelho.marca);
          if (aparelho.modelo) setModelo(aparelho.modelo);
          if (aparelho.armazenamentoGb) setArmazenamento(String(aparelho.armazenamentoGb));
          if (aparelho.cor) setCor(aparelho.cor);
          if (aparelho.imei) setImei(aparelho.imei);
          if (aparelho.valorMercado) setValor(valorEmCampo(aparelho.valorMercado));
        }
        setPropostaCodigo(proposta.codigo);
      } catch (err) {
        if (!cancelado) falha(err, 'Não foi possível carregar a proposta do parceiro.');
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaUrl]);

  /* --------------- Catálogo de modelos (preenchimento rápido) ------------ */

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const itens: ModeloCatalogo[] = [];
        let pagina = 1;
        for (;;) {
          const resp = await apiFetch<Paginacao<ModeloCatalogo>>('/modelos-aparelho', {
            query: { pagina, porPagina: 100 },
          });
          itens.push(...resp.itens);
          if (itens.length >= resp.total || resp.itens.length === 0) break;
          pagina += 1;
        }
        if (!cancelado) setCatalogo(itens.filter((m) => m.ativo !== false));
      } catch {
        // sem catálogo (offline/erro) → o formulário segue com digitação manual
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const usarCatalogo = catalogo.length > 0 && !aparelhoManual;
  const marcas = useMemo(
    () => [...new Set(catalogo.map((m) => m.marca))].sort((a, b) => a.localeCompare(b)),
    [catalogo],
  );
  const modelosDaMarca = useMemo(
    () => [...new Set(catalogo.filter((m) => m.marca === marca).map((m) => m.modelo))],
    [catalogo, marca],
  );
  const opcoesGb = useMemo(
    () =>
      catalogo
        .filter((m) => m.marca === marca && m.modelo === modelo)
        .sort((a, b) => a.armazenamentoGb - b.armazenamentoGb),
    [catalogo, marca, modelo],
  );

  // Valor veio da tabela do catálogo → somente leitura (evita divergência
  // entre o capital segurado e o voucher/franquia calculados a partir dele).
  const valorDoCatalogo =
    usarCatalogo &&
    valor !== '' &&
    opcoesGb.some((m) => String(m.armazenamentoGb) === armazenamento);

  function escolherGb(entrada: ModeloCatalogo) {
    setArmazenamento(String(entrada.armazenamentoGb));
    setValor(valorEmCampo(entrada.valorReferencia));
  }

  function escolherModelo(novoModelo: string) {
    setModelo(novoModelo);
    const opcoes = catalogo
      .filter((m) => m.marca === marca && m.modelo === novoModelo)
      .sort((a, b) => a.armazenamentoGb - b.armazenamentoGb);
    // um único armazenamento no catálogo → já preenche GB e valor
    if (opcoes.length === 1) escolherGb(opcoes[0]);
    else {
      setArmazenamento('');
      setValor('');
    }
  }

  /* --------------- CPF: cadastro próprio → consulta externa (KYC) -------- */

  useEffect(() => {
    const d = apenasDigitos(cpf);
    if (!cpfValido(d)) {
      cpfBuscadoRef.current = '';
      setAvisoCpf(null);
      return;
    }
    if (d === cpfBuscadoRef.current) return;
    cpfBuscadoRef.current = d;
    let cancelado = false;
    (async () => {
      setBuscandoCpf(true);
      try {
        const pagina = await apiFetch<Paginacao<Cliente>>('/clientes', {
          query: { busca: d, porPagina: 5 },
        });
        if (cancelado) return;
        const existente = pagina.itens.find((c) => apenasDigitos(c.cpf) === d);
        if (existente) {
          setNome(existente.nome);
          if (existente.telefoneWhatsapp) setTelefone(mascararTelefone(existente.telefoneWhatsapp));
          if (existente.email) setEmail(existente.email);
          if (existente.nascimento) setNascimento(existente.nascimento.slice(0, 10));
          setAvisoCpf('Cliente já cadastrado — dados preenchidos.');
          return;
        }
        // Não é cliente ainda → consulta externa (auditada no backend / LGPD).
        try {
          const kyc = await apiFetch<{ nome: string; nascimento?: string | null }>(`/kyc/cpf/${d}`);
          if (cancelado) return;
          if (kyc?.nome) {
            setNome(kyc.nome);
            if (kyc.nascimento) setNascimento(kyc.nascimento.slice(0, 10));
            setAvisoCpf('Dados localizados na consulta de CPF — confira antes de seguir.');
            return;
          }
        } catch {
          // 501 (provedor não configurado), 404 ou instabilidade → digitação manual
        }
        setAvisoCpf(null);
      } catch {
        // busca é só conveniência — em erro, o vendedor digita normalmente
      } finally {
        if (!cancelado) setBuscandoCpf(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [cpf]);

  /* --------------- IMEI → TAC: identifica o modelo pela base ------------- */

  const tacBuscadoRef = useRef('');
  useEffect(() => {
    if (!imeiOk) return;
    // só sugere se o vendedor ainda não escolheu marca/modelo
    if (marca || modelo) return;
    const tac = imeiDigitos.slice(0, 8);
    if (tac === tacBuscadoRef.current) return;
    tacBuscadoRef.current = tac;
    let cancelado = false;
    (async () => {
      try {
        const r = await apiFetch<{
          encontrado: boolean;
          marca?: string;
          modelo?: string;
          armazenamentoGb?: number;
        }>(`/aparelhos/tac/${tac}`);
        if (cancelado || !r.encontrado || !r.marca || !r.modelo) return;
        const doCatalogo = catalogo.filter((m) => m.marca === r.marca && m.modelo === r.modelo);
        if (doCatalogo.length > 0 && !aparelhoManual) {
          setMarca(r.marca);
          setModelo(r.modelo);
          const gb = doCatalogo.find((m) => m.armazenamentoGb === r.armazenamentoGb);
          if (gb) escolherGb(gb);
        } else {
          setAparelhoManual(true);
          setMarca(r.marca);
          setModelo(r.modelo);
          if (r.armazenamentoGb) setArmazenamento(String(r.armazenamentoGb));
        }
        setAvisoImei('Modelo identificado pelo IMEI — confira.');
      } catch {
        // identificação é conveniência — sem ela o fluxo segue normal
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imeiOk, imeiDigitos, marca, modelo, catalogo, aparelhoManual]);

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
    if (!cpfValido(cpfDigitos)) locais.push('CPF inválido — confira os dígitos.');
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
  // Antifraude (M2): o vendedor NÃO aprova mais a vistoria — o CLIENTE conclui
  // pelo link enviado ao WhatsApp dele. O wizard fica em polling até aprovar.

  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    if (etapa !== 'vistoria' || !vistoria || vistoria.status !== 'PENDENTE') return;
    const t = window.setInterval(() => {
      apiFetch<Vistoria>(`/vistorias/${vistoria.id}`)
        .then(setVistoria)
        .catch(() => undefined); // rede oscilou: mantém tentando
    }, 4000);
    return () => window.clearInterval(t);
  }, [etapa, vistoria]);

  async function carregarPlanos(): Promise<void> {
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
  }

  // Vistoria aprovada (pelo cliente ou exceção do backoffice) → planos → avança.
  useEffect(() => {
    if (etapa !== 'vistoria' || vistoria?.status !== 'APROVADA') return;
    let ativo = true;
    void (async () => {
      try {
        await carregarPlanos();
        if (ativo) setEtapa('plano');
      } catch (err) {
        if (ativo) falha(err, 'Erro ao carregar os planos.');
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, vistoria?.status]);

  async function reenviarLinkVistoria() {
    if (!vistoria || enviando) return;
    setErros([]);
    setEnviando(true);
    try {
      const atualizada = await apiFetch<Vistoria>(`/vistorias/${vistoria.id}/reenviar-link`, {
        method: 'POST',
      });
      setVistoria(atualizada);
      setReenviado(true);
      window.setTimeout(() => setReenviado(false), 4000);
    } catch (err) {
      falha(err, 'Erro ao reenviar o link.');
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
          propostaExterna: propostaCodigo ?? undefined,
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
            {propostaCodigo && (
              <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
                Proposta recebida do CRM do parceiro — confira os dados antes de seguir.
              </div>
            )}
            <section className="card">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                Cliente
              </h2>
              {/* CPF primeiro: preenche nome e nascimento automaticamente */}
              <div className="mb-3">
                <label htmlFor="cpf" className="rotulo">
                  CPF
                </label>
                <input
                  id="cpf"
                  className="campo"
                  required
                  autoFocus
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(mascararCpf(e.target.value))}
                />
                {buscandoCpf && (
                  <p className="mt-1 text-xs text-slate-400" aria-live="polite">
                    Buscando dados do CPF…
                  </p>
                )}
                {!buscandoCpf && avisoCpf && (
                  <p className="mt-1 text-xs text-sol-verde" aria-live="polite">
                    {avisoCpf}
                  </p>
                )}
                {!buscandoCpf &&
                  !avisoCpf &&
                  apenasDigitos(cpf).length === 11 &&
                  !cpfValido(cpf) && (
                    <p className="mt-1 text-xs text-red-500" aria-live="polite">
                      CPF inválido — confira os dígitos.
                    </p>
                  )}
              </div>
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
              {usarCatalogo ? (
                <>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="marca" className="rotulo">
                        Marca
                      </label>
                      <select
                        id="marca"
                        className="campo"
                        required
                        value={marca}
                        onChange={(e) => {
                          setMarca(e.target.value);
                          setModelo('');
                          setArmazenamento('');
                          setValor('');
                        }}
                      >
                        <option value="">Selecione…</option>
                        {marcas.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="modelo" className="rotulo">
                        Modelo
                      </label>
                      <select
                        id="modelo"
                        className="campo"
                        required
                        disabled={!marca}
                        value={modelo}
                        onChange={(e) => escolherModelo(e.target.value)}
                      >
                        <option value="">Selecione…</option>
                        {modelosDaMarca.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="gb" className="rotulo">
                        Armazenamento
                      </label>
                      <select
                        id="gb"
                        className="campo"
                        required
                        disabled={!modelo}
                        value={armazenamento}
                        onChange={(e) => {
                          const entrada = opcoesGb.find(
                            (m) => String(m.armazenamentoGb) === e.target.value,
                          );
                          if (entrada) escolherGb(entrada);
                          else setArmazenamento(e.target.value.replace(/\D/g, ''));
                        }}
                      >
                        <option value="">Selecione…</option>
                        {opcoesGb.map((m) => (
                          <option key={m.id} value={String(m.armazenamentoGb)}>
                            {m.armazenamentoGb} GB
                          </option>
                        ))}
                      </select>
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
                  <p className="mb-3 text-xs text-slate-400">
                    Aparelho fora do catálogo?{' '}
                    <button
                      type="button"
                      className="font-semibold text-sol-azul underline"
                      onClick={() => setAparelhoManual(true)}
                    >
                      Digitar manualmente
                    </button>
                  </p>
                </>
              ) : (
                <>
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
                  {catalogo.length > 0 && (
                    <p className="mb-3 text-xs text-slate-400">
                      <button
                        type="button"
                        className="font-semibold text-sol-azul underline"
                        onClick={() => setAparelhoManual(false)}
                      >
                        Voltar para o catálogo
                      </button>
                    </p>
                  )}
                </>
              )}
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
                {avisoImei && (
                  <p className="mt-1 text-xs text-sol-verde" aria-live="polite">
                    {avisoImei}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="valor" className="rotulo">
                  Valor de referência (R$)
                </label>
                <input
                  id="valor"
                  className={`campo ${valorDoCatalogo ? 'bg-slate-100 text-slate-600' : ''}`}
                  required
                  readOnly={valorDoCatalogo}
                  inputMode="decimal"
                  placeholder="3500,00"
                  value={valor}
                  onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))}
                />
                {valorDoCatalogo && (
                  <p className="mt-1 text-xs text-slate-400">
                    Preenchido pela tabela de referência do catálogo — define o capital segurado e o
                    voucher. Para editar, use o modo manual.
                  </p>
                )}
              </div>
            </section>

            <button type="submit" disabled={enviando} className="btn-verde">
              {enviando ? 'Salvando…' : 'Iniciar vistoria'}
            </button>
          </form>
        )}

        {/* ---------------- Etapa 2: vistoria remota (cliente) ---------------- */}
        {etapa === 'vistoria' && vistoria && (
          <div className="flex flex-col gap-5">
            <section className="card text-center">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
                Vistoria pelo cliente
              </h2>
              {vistoria.status === 'PENDENTE' && (
                <>
                  <div className="mx-auto my-4 h-10 w-10 animate-spin rounded-full border-4 border-sol-azul border-t-transparent" />
                  <p className="text-sm font-medium text-slate-800">
                    Link enviado ao WhatsApp do cliente
                    {vistoria.cliente?.telefoneWhatsapp
                      ? ` (…${vistoria.cliente.telefoneWhatsapp.replace(/\D/g, '').slice(-4)})`
                      : ''}
                    .
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Peça para o cliente abrir o link <strong>no próprio aparelho</strong>: ele
                    confirma o IMEI (<span className="font-mono">*#06#</span>) e tira 3 fotos. Esta
                    tela avança sozinha quando a vistoria for aprovada.
                  </p>
                  {vistoria.tokenExpiraEm && new Date(vistoria.tokenExpiraEm) < new Date() && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      ⏰ O link expirou sem conclusão. Reenvie abaixo — o cliente recebe um link
                      novo na hora (não precisa recomeçar o cadastro).
                    </p>
                  )}
                </>
              )}
              {vistoria.status === 'EM_ANALISE' && (
                <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  ⚠️ O cliente concluiu, mas o <strong>IMEI digitado não confere</strong> com o
                  cadastrado. A vistoria foi para análise do backoffice — a venda só continua se a
                  equipe aprovar. Confira o IMEI com o cliente.
                </p>
              )}
              {vistoria.status === 'REPROVADA' && (
                <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700">
                  ❌ Vistoria reprovada{vistoria.motivoReprova ? `: ${vistoria.motivoReprova}` : ''}
                  . Inicie uma nova proteção.
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400">
                Aparelho: {aparelho?.marca} {aparelho?.modelo} — IMEI final{' '}
                {aparelho?.imei.slice(-4)}
              </p>
            </section>

            {(vistoria.status === 'PENDENTE' || vistoria.status === 'EM_ANALISE') && (
              <button onClick={reenviarLinkVistoria} disabled={enviando} className="btn-secundario">
                {enviando
                  ? 'Reenviando…'
                  : reenviado
                    ? '✓ Link reenviado!'
                    : 'Reenviar link ao cliente'}
              </button>
            )}
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
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">
                    Nenhum plano ativo cobre um aparelho de {reais(valorNum)}.
                  </p>
                  <p className="mt-1 text-xs">
                    O que fazer: (1) confira se o valor de referência está correto na etapa Dados;
                    (2) peça ao administrador para criar/ajustar uma faixa de plano em{' '}
                    <strong>Painel Admin → Planos</strong> cobrindo este valor (campos “valor do
                    aparelho mín/máx”); (3) volte aqui e toque em atualizar. A vistoria já aprovada
                    continua válida.
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-sol-azul underline"
                    onClick={() => void carregarPlanos().catch(() => undefined)}
                  >
                    ↻ Atualizar planos
                  </button>
                </div>
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
            {contrato.checkout?.fallbackDe === 'PIX' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                ⏰ O Pix não foi pago a tempo — geramos um <strong>boleto</strong> automaticamente e
                enviamos o link no WhatsApp do cliente. Pela página do boleto ele também pode pagar
                com Pix ou cartão.
              </div>
            )}
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

              {contrato.formaPagamento === 'PIX' && (
                <p className="mb-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  💡 O cliente pode <strong>parcelar este Pix</strong> pelo app do banco dele
                  (Nubank, Mercado Pago, PicPay e outros) — a loja recebe à vista normalmente.
                </p>
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
