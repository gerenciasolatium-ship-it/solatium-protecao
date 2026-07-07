import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/** /validar/:codigo fica FORA do prefixo /api no backend. */
const VALIDAR_BASE = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000/api'
).replace(/\/api\/?$/, '');

interface CertificadoPublico {
  numero: string;
  status: 'ATIVO' | 'SUSPENSO' | 'CANCELADO' | 'EXPIRADO';
  vigenciaInicio: string;
  vigenciaFim: string;
  titular: string;
  aparelho: string;
  imei: string;
  lojaParceira: string;
}

const STATUS_UI: Record<
  CertificadoPublico['status'],
  { rotulo: string; classes: string; emoji: string }
> = {
  ATIVO: { rotulo: 'ATIVO', classes: 'bg-sol-verde/10 text-sol-verde', emoji: '✅' },
  SUSPENSO: {
    rotulo: 'SUSPENSO — sem cobertura',
    classes: 'bg-amber-100 text-amber-700',
    emoji: '⚠️',
  },
  CANCELADO: { rotulo: 'CANCELADO', classes: 'bg-red-100 text-red-700', emoji: '❌' },
  EXPIRADO: { rotulo: 'EXPIRADO', classes: 'bg-slate-200 text-slate-600', emoji: '⌛' },
};

function dataBr(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Página pública (sem login) aberta pelo QR code do bilhete. */
export function ValidarCertificado() {
  const { codigo } = useParams<{ codigo: string }>();
  const [certificado, setCertificado] = useState<CertificadoPublico | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!codigo) return;
    fetch(`${VALIDAR_BASE}/validar/${codigo}`)
      .then(async (resp) => {
        if (!resp.ok)
          throw new Error(resp.status === 404 ? 'Certificado não encontrado.' : 'Erro ao validar.');
        setCertificado((await resp.json()) as CertificadoPublico);
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [codigo]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-sol-azul px-4 py-5 text-center text-white">
        <h1 className="text-xl font-bold">PROTEÇÃO SOLATIUM</h1>
        <p className="text-sm text-white/80">Validação de certificado</p>
      </header>

      <main className="mx-auto max-w-app px-4 py-6">
        {carregando && <p className="text-center text-slate-500">Validando…</p>}

        {erro && (
          <div className="card text-center">
            <div className="mb-2 text-4xl" aria-hidden>
              ❌
            </div>
            <p className="font-semibold text-red-700">{erro}</p>
            <p className="mt-2 text-xs text-slate-500">
              Confira o código ou fale com a Proteção Solatium pelo WhatsApp oficial.
            </p>
          </div>
        )}

        {certificado && (
          <div className="card">
            <div
              className={`mb-4 rounded-xl px-4 py-3 text-center text-sm font-bold ${STATUS_UI[certificado.status].classes}`}
            >
              {STATUS_UI[certificado.status].emoji} {STATUS_UI[certificado.status].rotulo}
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Certificado
                </dt>
                <dd className="font-mono font-semibold">{certificado.numero}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Titular
                </dt>
                <dd>{certificado.titular}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Aparelho
                </dt>
                <dd>{certificado.aparelho}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">IMEI</dt>
                <dd className="font-mono">{certificado.imei}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Vigência
                </dt>
                <dd>
                  {dataBr(certificado.vigenciaInicio)} a {dataBr(certificado.vigenciaFim)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Loja parceira
                </dt>
                <dd>{certificado.lojaParceira}</dd>
              </div>
            </dl>
          </div>
        )}
      </main>
    </div>
  );
}
