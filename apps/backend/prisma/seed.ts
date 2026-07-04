/**
 * Seed de desenvolvimento — popula dados de exemplo (CLAUDE.md / Sprint 1).
 * Idempotente: usa upsert por campos únicos. Rode com `pnpm db:seed`.
 *
 * Credenciais criadas:
 *   ADMIN     -> admin@solatium.com.br / Solatium@123
 *   VENDEDOR  -> (ver e-mails abaixo) / Loja@123
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Gera um CPF válido (com os 2 dígitos verificadores) a partir de uma base de 9 dígitos. */
function cpfComDV(base9: string): string {
  const calc = (nums: number[]): number => {
    let soma = 0;
    let peso = nums.length + 1;
    for (const n of nums) {
      soma += n * peso;
      peso--;
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const arr = base9.split('').map(Number);
  const d1 = calc(arr);
  const d2 = calc([...arr, d1]);
  return base9 + d1 + d2;
}

async function main() {
  console.log('🌱 Semeando dados de exemplo...');

  // --- 1) ADMIN ---
  const adminHash = await argon2.hash('Solatium@123');
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@solatium.com.br' },
    update: {},
    create: {
      nome: 'Administrador Solatium',
      email: 'admin@solatium.com.br',
      senhaHash: adminHash,
      role: Role.ADMIN,
    },
  });
  console.log(`  ✔ admin: ${admin.email}`);

  // --- 2) PLANOS ---
  const planos = [
    {
      nome: 'Essencial',
      descricao: 'Cobertura de roubo e furto qualificado.',
      periodicidade: 'MENSAL' as const,
      premioMensal: 19.9,
      capitalSegurado: 2000,
      valorAparelhoMin: 0,
      valorAparelhoMax: 2500,
    },
    {
      nome: 'Completo',
      descricao: 'Roubo, furto qualificado e furto simples.',
      periodicidade: 'MENSAL' as const,
      premioMensal: 29.9,
      capitalSegurado: 4000,
      valorAparelhoMin: 2500,
      valorAparelhoMax: 6000,
    },
    {
      nome: 'Anual',
      descricao: 'Plano Completo pago à vista (12 meses).',
      periodicidade: 'ANUAL' as const,
      premioAnual: 299,
      capitalSegurado: 4000,
      valorAparelhoMin: 0,
      valorAparelhoMax: 6000,
    },
  ];
  for (const p of planos) {
    const existente = await prisma.plano.findFirst({ where: { nome: p.nome } });
    if (existente) {
      await prisma.plano.update({ where: { id: existente.id }, data: p });
    } else {
      await prisma.plano.create({ data: p });
    }
  }
  console.log(`  ✔ ${planos.length} planos`);

  // --- 3) LOJAS + VENDEDORES ---
  const lojasSeed = [
    {
      nome: 'BRT Celulares — Centro',
      cnpj: '11222333000181',
      cidade: 'São Paulo',
      uf: 'SP',
      vendedores: [
        { nome: 'João Vendedor', base: '390533447', email: 'joao.centro@brt.com.br' },
        { nome: 'Ana Vendas', base: '468731820', email: 'ana.centro@brt.com.br' },
      ],
    },
    {
      nome: 'TechFone — Shopping Norte',
      cnpj: '44555666000199',
      cidade: 'Campinas',
      uf: 'SP',
      vendedores: [
        { nome: 'Carlos Balcão', base: '705060094', email: 'carlos.norte@techfone.com.br' },
        { nome: 'Marina Loja', base: '820019243', email: 'marina.norte@techfone.com.br' },
      ],
    },
  ];

  const vendedorHash = await argon2.hash('Loja@123');
  for (const l of lojasSeed) {
    const loja = await prisma.loja.upsert({
      where: { cnpj: l.cnpj },
      update: {},
      create: {
        nome: l.nome,
        cnpj: l.cnpj,
        cidade: l.cidade,
        uf: l.uf,
        comissaoPct: 0.3,
        status: 'ATIVA',
      },
    });

    for (const v of l.vendedores) {
      const cpf = cpfComDV(v.base);
      const usuario = await prisma.usuario.upsert({
        where: { email: v.email },
        update: {},
        create: {
          nome: v.nome,
          email: v.email,
          senhaHash: vendedorHash,
          role: Role.LOJA_VENDEDOR,
          lojaId: loja.id,
        },
      });
      await prisma.vendedor.upsert({
        where: { cpf },
        update: {},
        create: {
          nome: v.nome,
          cpf,
          email: v.email,
          lojaId: loja.id,
          usuarioId: usuario.id,
        },
      });
    }
    console.log(`  ✔ loja ${loja.nome} + ${l.vendedores.length} vendedores`);
  }

  // --- 4) CLIENTES ---
  const clientesSeed = [
    { nome: 'Maria Souza', base: '529982247', tel: '11999990001' },
    { nome: 'Pedro Almeida', base: '111444777', tel: '11999990002' },
    { nome: 'Juliana Costa', base: '295379955', tel: '11999990003' },
    { nome: 'Rafael Lima', base: '640827411', tel: '19999990004' },
    { nome: 'Beatriz Rocha', base: '873109566', tel: '19999990005' },
  ];
  for (const c of clientesSeed) {
    const cpf = cpfComDV(c.base);
    await prisma.cliente.upsert({
      where: { cpf },
      update: {},
      create: { nome: c.nome, cpf, telefoneWhatsapp: c.tel },
    });
  }
  console.log(`  ✔ ${clientesSeed.length} clientes`);

  console.log('✅ Seed concluído.');
}

main()
  .catch((e) => {
    console.error('❌ Falha no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
