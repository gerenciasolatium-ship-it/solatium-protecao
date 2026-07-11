import { useRef, useState } from 'react';
import Modal from './Modal';
import { api, ApiError } from '../lib/api';
import { btnPrimary, btnSecundario, inputClass, labelClass } from '../lib/ui';

interface ResultadoImportacao {
  criadas: number;
  ignoradas: number;
  erros: Array<{ linha: number; erro: string; dados?: Record<string, string> }>;
}

interface ImportCsvModalProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  /** Endpoint POST que recebe { csv, ...extras }. */
  endpoint: string;
  /** Colunas esperadas (mostradas como guia + modelo pra download). */
  colunas: string[];
  /** Campo extra opcional (ex.: senha padrão dos vendedores). */
  extra?: { chave: string; rotulo: string; tipo?: string };
  onImportou: () => void;
}

/** Modal de importação em massa via CSV com relatório por linha. */
export default function ImportCsvModal({
  aberto,
  onFechar,
  titulo,
  endpoint,
  colunas,
  extra,
  onImportou,
}: ImportCsvModalProps) {
  const [csv, setCsv] = useState('');
  const [valorExtra, setValorExtra] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  function fechar(): void {
    setCsv('');
    setValorExtra('');
    setErro(null);
    setResultado(null);
    onFechar();
  }

  async function lerArquivo(arquivo: File | undefined): Promise<void> {
    if (!arquivo) return;
    setCsv(await arquivo.text());
  }

  async function enviar(): Promise<void> {
    setEnviando(true);
    setErro(null);
    setResultado(null);
    try {
      const body: Record<string, unknown> = { csv };
      if (extra && valorExtra.trim()) body[extra.chave] = valorExtra.trim();
      const r = await api.post<ResultadoImportacao>(endpoint, body);
      setResultado(r);
      if (r.criadas > 0) onImportou();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro na importação.');
    } finally {
      setEnviando(false);
    }
  }

  function baixarModelo(): void {
    const blob = new Blob([`${colunas.join(';')}\n`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modelo-importacao.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={fechar}>
      <div className="space-y-4 text-sm">
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-slate-600">
          <div className="mb-1 font-medium text-slate-700">Formato esperado (separador ; ou ,)</div>
          <code className="block overflow-x-auto whitespace-nowrap text-xs">
            {colunas.join(';')}
          </code>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-sol-azul hover:underline"
            onClick={baixarModelo}
          >
            Baixar modelo CSV
          </button>
        </div>

        <div>
          <label className={labelClass}>Arquivo CSV</label>
          <input
            ref={inputArquivo}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void lerArquivo(e.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-sol-azul file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
          />
        </div>

        <div>
          <label className={labelClass}>Ou cole o conteúdo</label>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            className={`${inputClass} min-h-32 font-mono text-xs`}
            placeholder={`${colunas.join(';')}\n…`}
          />
        </div>

        {extra && (
          <div>
            <label className={labelClass}>{extra.rotulo}</label>
            <input
              type={extra.tipo ?? 'text'}
              value={valorExtra}
              onChange={(e) => setValorExtra(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        {erro && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-700">
            {erro}
          </div>
        )}

        {resultado && (
          <div className="space-y-2">
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-green-800">
              ✓ {resultado.criadas} criada(s) · {resultado.ignoradas} já existiam ·{' '}
              {resultado.erros.length} erro(s)
            </div>
            {resultado.erros.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border border-amber-200 bg-amber-50 p-3">
                <div className="mb-1 font-medium text-amber-800">Linhas com erro:</div>
                <ul className="space-y-0.5 text-xs text-amber-800">
                  {resultado.erros.map((e) => (
                    <li key={e.linha}>
                      Linha {e.linha}: {e.erro}
                      {e.dados?.nome ? ` (${e.dados.nome})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnSecundario} onClick={fechar}>
            Fechar
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={enviando || csv.trim().length < 3}
            onClick={() => void enviar()}
          >
            {enviando ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
