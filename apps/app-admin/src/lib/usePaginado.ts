import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

const POR_PAGINA = 10;

/**
 * Hook de listagem paginada com busca (debounce). Serve todas as tabelas do app.
 */
export function usePaginado<T>(recurso: string) {
  const [itens, setItens] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await api.listar<T>(recurso, {
        pagina,
        porPagina: POR_PAGINA,
        busca,
      });
      setItens(resultado.itens);
      setTotal(resultado.total);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Erro ao carregar os dados.');
      setItens([]);
      setTotal(0);
    } finally {
      setCarregando(false);
    }
  }, [recurso, pagina, busca]);

  // Debounce simples: recarrega 250ms após a última mudança de página/busca.
  useEffect(() => {
    const t = setTimeout(() => {
      void carregar();
    }, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  function mudarBusca(valor: string): void {
    setBusca(valor);
    setPagina(1);
  }

  return {
    itens,
    total,
    pagina,
    porPagina: POR_PAGINA,
    busca,
    carregando,
    erro,
    setPagina,
    mudarBusca,
    recarregar: carregar,
  };
}
