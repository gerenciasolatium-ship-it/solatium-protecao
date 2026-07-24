import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '../lib/api';

interface InfoVistoria {
  status: 'PENDENTE' | 'APROVADA' | 'EM_ANALISE' | 'REPROVADA' | 'EXPIRADO';
  expiraEm?: string | null;
  clientePrimeiroNome: string;
  aparelho: { marca: string; modelo: string };
  loja: string;
  concluidaEm?: string | null;
}

type TipoFoto = 'frente' | 'verso' | 'imei';

const FOTOS: Array<{ tipo: TipoFoto; titulo: string; dica: string }> = [
  { tipo: 'frente', titulo: 'Frente do aparelho', dica: 'Aparelho LIGADO, mostrando a tela.' },
  { tipo: 'verso', titulo: 'Verso do aparelho', dica: 'Traseira inteira, sem capinha.' },
  {
    tipo: 'imei',
    titulo: 'Tela do IMEI',
    dica: 'Disque *#06# e fotografe a tela mostrando o IMEI.',
  },
];

/** Comprime a foto no navegador (máx. 1280px, JPEG 0.7) → base64 sem prefixo. */
async function comprimirFoto(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Navegador sem suporte a canvas.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  return dataUrl.split(',')[1] ?? '';
}

/**
 * Identifica o dispositivo que está fazendo a vistoria (antifraude: o backend
 * cruza com o aparelho segurado — vistoria de outro celular cai em análise).
 * Nada aqui pede permissão: só metadados que o navegador já expõe.
 */
async function coletarDispositivo(): Promise<string> {
  const dados: Record<string, unknown> = {
    ua: navigator.userAgent,
    tela: `${screen.width}x${screen.height}@${window.devicePixelRatio}`,
    toque: navigator.maxTouchPoints,
    nucleos: navigator.hardwareConcurrency,
  };
  try {
    // Android/Chrome expõe o modelo exato (ex.: "SM-S918B") via Client Hints.
    const uaData = (
      navigator as Navigator & {
        userAgentData?: {
          platform?: string;
          getHighEntropyValues?: (hints: string[]) => Promise<Record<string, string>>;
        };
      }
    ).userAgentData;
    if (uaData?.getHighEntropyValues) {
      const altos = await uaData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
      if (altos.model) dados.modelo = altos.model;
      if (altos.platform) dados.plataforma = altos.platform;
      if (altos.platformVersion) dados.versaoSo = altos.platformVersion;
    } else if (uaData?.platform) {
      dados.plataforma = uaData.platform;
    }
  } catch {
    // segue só com o user-agent
  }
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) dados.gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch {
    // segue sem GPU
  }
  return JSON.stringify(dados).slice(0, 2000);
}

/**
 * Vistoria remota (M2): o CLIENTE abre este link no próprio celular, confirma
 * o IMEI (*#06#) e envia 3 fotos. Antifraude: prova que o aparelho existe,
 * liga e está com o cliente NO MOMENTO da contratação.
 */
export function VistoriaRemota() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<InfoVistoria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [imei, setImei] = useState('');
  const [fotos, setFotos] = useState<Partial<Record<TipoFoto, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ status: string; mensagem: string } | null>(null);
  const [restante, setRestante] = useState<number | null>(null);
  const [renovando, setRenovando] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<InfoVistoria>(`/vistoria-remota/${token}`, { auth: false })
      .then(setInfo)
      .catch((e) => setErro(e instanceof ApiError ? e.message : 'Link inválido.'));
  }, [token]);

  // Contagem regressiva da validade do link.
  useEffect(() => {
    if (!info?.expiraEm || info.status !== 'PENDENTE') return;
    const tick = () => {
      const s = Math.floor((new Date(info.expiraEm!).getTime() - Date.now()) / 1000);
      setRestante(s > 0 ? s : 0);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [info]);

  /** Link venceu → o próprio cliente pede um novo (fotos já tiradas continuam). */
  async function gerarNovoLink() {
    if (!token || renovando) return;
    setRenovando(true);
    setErro(null);
    try {
      const r = await apiFetch<{ token: string; expiraEm: string }>(
        `/vistoria-remota/${token}/novo-link`,
        { method: 'POST', auth: false },
      );
      navigate(`/vistoria/${r.token}`, { replace: true });
    } catch (e) {
      setErro(
        e instanceof ApiError
          ? e.message
          : 'Não foi possível gerar um novo link. Peça ao vendedor para reenviar.',
      );
    } finally {
      setRenovando(false);
    }
  }

  async function escolherFoto(tipo: TipoFoto, arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const base64 = await comprimirFoto(arquivo);
      setFotos((f) => ({ ...f, [tipo]: base64 }));
    } catch {
      setErro('Não foi possível processar a foto. Tente novamente.');
    }
  }

  async function enviar() {
    if (!token) return;
    setEnviando(true);
    setErro(null);
    try {
      // Geolocalização é opcional: pede permissão, segue sem se negada.
      const geo = await new Promise<{ lat: number; lng: number; precisao?: number } | undefined>(
        (resolve) => {
          if (!navigator.geolocation) return resolve(undefined);
          navigator.geolocation.getCurrentPosition(
            (p) =>
              resolve({
                lat: p.coords.latitude,
                lng: p.coords.longitude,
                precisao: p.coords.accuracy,
              }),
            () => resolve(undefined),
            { timeout: 5000 },
          );
        },
      );

      const r = await apiFetch<{ status: string; mensagem: string }>(
        `/vistoria-remota/${token}/concluir`,
        {
          method: 'POST',
          auth: false,
          body: {
            imei: imei.replace(/\D/g, ''),
            fotos: FOTOS.map((f) => ({ tipo: f.tipo, base64: fotos[f.tipo] ?? '' })),
            geolocalizacao: geo,
            dispositivo: await coletarDispositivo(),
          },
        },
      );
      setResultado(r);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro ao enviar a vistoria. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const imeiDigitos = imei.replace(/\D/g, '');
  const pronto = imeiDigitos.length >= 14 && FOTOS.every((f) => fotos[f.tipo]);
  // Vencido no backend OU contagem zerada na tela: mesmo tratamento.
  const linkVencido =
    info?.status === 'EXPIRADO' || (info?.status === 'PENDENTE' && restante === 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-sol-azul px-4 py-4 text-white">
        <p className="text-xs text-white/70">Proteção Solatium</p>
        <h1 className="text-lg font-semibold">Vistoria do aparelho</h1>
      </header>

      <main className="mx-auto max-w-app px-4 py-5">
        {erro && !info && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {erro}
          </div>
        )}

        {resultado && (
          <div
            className={`rounded-2xl border p-5 text-center ${
              resultado.status === 'APROVADA'
                ? 'border-green-200 bg-green-50'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            <div className="text-4xl">{resultado.status === 'APROVADA' ? '✅' : '🕐'}</div>
            <p className="mt-2 font-medium text-slate-800">{resultado.mensagem}</p>
          </div>
        )}

        {info && !resultado && (
          <>
            {linkVencido && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
                <div className="text-4xl">⏰</div>
                <p className="mt-2 font-medium text-amber-800">
                  Este link expirou — mas é só gerar outro e continuar daqui mesmo. Suas fotos já
                  tiradas não se perdem.
                </p>
                {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
                <button
                  onClick={() => void gerarNovoLink()}
                  disabled={renovando}
                  className="mt-4 w-full rounded-xl bg-sol-verde py-3 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
                >
                  {renovando ? 'Gerando novo link…' : 'Gerar novo link e continuar'}
                </button>
                <p className="mt-2 text-xs text-amber-700">
                  Se não funcionar, peça ao vendedor da loja {info.loja} para reenviar o link.
                </p>
              </div>
            )}
            {(info.status === 'APROVADA' || info.status === 'EM_ANALISE') && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
                <p className="font-medium text-green-800">
                  Vistoria já concluída. Pode voltar ao balcão. 👍
                </p>
              </div>
            )}
            {info.status === 'REPROVADA' && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
                <p className="font-medium text-red-800">
                  Esta vistoria foi reprovada. Procure o vendedor na loja.
                </p>
              </div>
            )}

            {info.status === 'PENDENTE' && !linkVencido && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Olá, <strong>{info.clientePrimeiroNome}</strong>! Para ativar a proteção do seu{' '}
                  <strong>
                    {info.aparelho.marca} {info.aparelho.modelo}
                  </strong>
                  , faça a vistoria abaixo <strong>usando o próprio aparelho</strong>.
                  {restante != null && (
                    <span className="mt-1 block text-xs text-slate-400">
                      Link válido por mais {Math.floor(restante / 60)}m{' '}
                      {String(restante % 60).padStart(2, '0')}s.
                    </span>
                  )}
                </p>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                    1. Confirme o IMEI
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Disque <strong className="font-mono">*#06#</strong> no telefone — o IMEI aparece
                    na tela. Digite os 15 números:
                  </p>
                  <input
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    inputMode="numeric"
                    placeholder="IMEI (15 dígitos)"
                    className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-base outline-none focus:border-sol-azul"
                  />
                  {imeiDigitos.length > 0 && imeiDigitos.length < 14 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Faltam dígitos ({imeiDigitos.length}/15).
                    </p>
                  )}
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                    2. Tire as 3 fotos
                  </h2>
                  <div className="mt-2 space-y-3">
                    {FOTOS.map((f) => (
                      <label
                        key={f.tipo}
                        className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${
                          fotos[f.tipo] ? 'border-green-300 bg-green-50' : 'border-slate-200'
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-medium text-slate-800">
                            {fotos[f.tipo] ? '✅ ' : '📷 '}
                            {f.titulo}
                          </span>
                          <span className="block text-xs text-slate-500">{f.dica}</span>
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => void escolherFoto(f.tipo, e.target.files?.[0])}
                        />
                        <span className="shrink-0 rounded-lg bg-sol-azul px-3 py-1.5 text-xs font-medium text-white">
                          {fotos[f.tipo] ? 'Trocar' : 'Tirar foto'}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>

                {erro && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {erro}
                  </div>
                )}

                <button
                  onClick={() => void enviar()}
                  disabled={!pronto || enviando}
                  className="w-full rounded-xl bg-sol-verde py-3.5 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
                >
                  {enviando ? 'Enviando vistoria…' : 'Enviar vistoria'}
                </button>
                <p className="text-center text-xs text-slate-400">
                  Ao enviar, registramos data/hora, localização (se permitida) e dados do
                  dispositivo como evidência da contratação.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
