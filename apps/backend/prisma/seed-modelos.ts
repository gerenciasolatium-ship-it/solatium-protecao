/**
 * Seed do catálogo de modelos — iPhones (X → 17 Pro Max).
 *
 * Valores de referência ESTIMADOS para o mercado brasileiro (jul/2026), mistura
 * de seminovo/novo conforme a idade da linha. São editáveis pelo admin em
 * /modelos — revisar antes de precificar a proteção.
 *
 * Idempotente: upsert pela chave única (marca, modelo, armazenamentoGb).
 * Rodar: DATABASE_URL=<url> pnpm exec ts-node prisma/seed-modelos.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// [modelo, [[GB, valorReferencia], ...]]
const IPHONES: [string, [number, number][]][] = [
  [
    'iPhone X',
    [
      [64, 900],
      [256, 1100],
    ],
  ],
  [
    'iPhone XR',
    [
      [64, 1000],
      [128, 1100],
      [256, 1250],
    ],
  ],
  [
    'iPhone XS',
    [
      [64, 1100],
      [256, 1300],
      [512, 1450],
    ],
  ],
  [
    'iPhone XS Max',
    [
      [64, 1300],
      [256, 1500],
      [512, 1650],
    ],
  ],
  [
    'iPhone 11',
    [
      [64, 1500],
      [128, 1650],
      [256, 1850],
    ],
  ],
  [
    'iPhone 11 Pro',
    [
      [64, 1900],
      [256, 2150],
      [512, 2350],
    ],
  ],
  [
    'iPhone 11 Pro Max',
    [
      [64, 2200],
      [256, 2450],
      [512, 2650],
    ],
  ],
  [
    'iPhone 12 mini',
    [
      [64, 1600],
      [128, 1750],
      [256, 1950],
    ],
  ],
  [
    'iPhone 12',
    [
      [64, 1900],
      [128, 2050],
      [256, 2250],
    ],
  ],
  [
    'iPhone 12 Pro',
    [
      [128, 2500],
      [256, 2750],
      [512, 3000],
    ],
  ],
  [
    'iPhone 12 Pro Max',
    [
      [128, 2900],
      [256, 3150],
      [512, 3400],
    ],
  ],
  [
    'iPhone 13 mini',
    [
      [128, 2200],
      [256, 2450],
      [512, 2700],
    ],
  ],
  [
    'iPhone 13',
    [
      [128, 2600],
      [256, 2850],
      [512, 3100],
    ],
  ],
  [
    'iPhone 13 Pro',
    [
      [128, 3300],
      [256, 3600],
      [512, 3900],
      [1024, 4200],
    ],
  ],
  [
    'iPhone 13 Pro Max',
    [
      [128, 3700],
      [256, 4000],
      [512, 4300],
      [1024, 4600],
    ],
  ],
  [
    'iPhone 14',
    [
      [128, 3100],
      [256, 3400],
      [512, 3700],
    ],
  ],
  [
    'iPhone 14 Plus',
    [
      [128, 3400],
      [256, 3700],
      [512, 4000],
    ],
  ],
  [
    'iPhone 14 Pro',
    [
      [128, 4200],
      [256, 4500],
      [512, 4900],
      [1024, 5300],
    ],
  ],
  [
    'iPhone 14 Pro Max',
    [
      [128, 4600],
      [256, 5000],
      [512, 5400],
      [1024, 5800],
    ],
  ],
  [
    'iPhone 15',
    [
      [128, 3900],
      [256, 4200],
      [512, 4600],
    ],
  ],
  [
    'iPhone 15 Plus',
    [
      [128, 4300],
      [256, 4600],
      [512, 5000],
    ],
  ],
  [
    'iPhone 15 Pro',
    [
      [128, 5200],
      [256, 5600],
      [512, 6000],
      [1024, 6500],
    ],
  ],
  [
    'iPhone 15 Pro Max',
    [
      [256, 6000],
      [512, 6500],
      [1024, 7000],
    ],
  ],
  [
    'iPhone 16e',
    [
      [128, 3900],
      [256, 4200],
      [512, 4600],
    ],
  ],
  [
    'iPhone 16',
    [
      [128, 4800],
      [256, 5200],
      [512, 5600],
    ],
  ],
  [
    'iPhone 16 Plus',
    [
      [128, 5300],
      [256, 5700],
      [512, 6100],
    ],
  ],
  [
    'iPhone 16 Pro',
    [
      [128, 6300],
      [256, 6800],
      [512, 7300],
      [1024, 7900],
    ],
  ],
  [
    'iPhone 16 Pro Max',
    [
      [256, 7300],
      [512, 7900],
      [1024, 8500],
    ],
  ],
  [
    'iPhone 17',
    [
      [256, 6500],
      [512, 7100],
    ],
  ],
  [
    'iPhone 17 Air',
    [
      [256, 7800],
      [512, 8400],
      [1024, 9100],
    ],
  ],
  [
    'iPhone 17 Pro',
    [
      [256, 9000],
      [512, 9700],
      [1024, 10400],
    ],
  ],
  [
    'iPhone 17 Pro Max',
    [
      [256, 10500],
      [512, 11200],
      [1024, 12000],
    ],
  ],
];

async function main(): Promise<void> {
  console.log('📱 Semeando catálogo de modelos (iPhone X → 17 Pro Max)...');
  let criados = 0;
  for (const [modelo, variantes] of IPHONES) {
    for (const [gb, valor] of variantes) {
      await prisma.modeloAparelho.upsert({
        where: {
          marca_modelo_armazenamentoGb: { marca: 'Apple', modelo, armazenamentoGb: gb },
        },
        update: {}, // não sobrescreve valores/preços já ajustados pelo admin
        create: { marca: 'Apple', modelo, armazenamentoGb: gb, valorReferencia: valor },
      });
      criados++;
    }
  }
  console.log(`✅ ${criados} variantes de modelo no catálogo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
