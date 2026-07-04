// Classes utilitárias reutilizáveis e formatadores em pt-BR.

export const inputClass =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sol-azul focus:ring-1 focus:ring-sol-azul';

export const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

export const btnPrimary =
  'inline-flex items-center justify-center rounded bg-sol-azul px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

export const btnVerde =
  'inline-flex items-center justify-center rounded bg-sol-verde px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

export const btnSecundario =
  'inline-flex items-center justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50';

export const btnLink = 'text-sm font-medium text-sol-azul hover:underline';

export const btnPerigo = 'text-sm font-medium text-red-600 hover:underline';

export function formatarMoeda(valor?: number | null): string {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarPct(valor?: number | null): string {
  if (valor === null || valor === undefined) return '—';
  return `${(valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function formatarCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatarCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}
