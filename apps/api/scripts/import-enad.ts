import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

function envFlag(name: string) {
  const v = (process.env[name] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes';
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const m = String(value).match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function resolveDocsDir() {
  // When executed as `npm --workspace apps/api run ...` cwd is `apps/api`.
  return path.resolve(process.cwd(), '..', '..', 'docs');
}

type ExtractedEnad = {
  pages: Array<{ page: number; text: string }>;
  items: Array<{
    code: string;
    questionCode: number;
    label: string;
    value1: string | null;
    value2: string | null;
    valueText: string | null;
  }>;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const reset = envFlag('IMPORT_RESET');

  const docsDir = resolveDocsDir();
  const pdfName = process.env.ENAD_PDF ?? 'Encuesta ENAD 2025[R].pdf';
  const pdfPath = path.join(docsDir, pdfName);
  if (!fs.existsSync(pdfPath)) throw new Error(`Missing file: ${pdfPath}`);

  const year = toInt(process.env.ENAD_YEAR) ?? 2025;
  const asOfDate = new Date(process.env.ENAD_AS_OF_DATE ?? `${year}-12-31`);

  const tenant =
    (await prisma.tenant.findFirst({ where: { slug: 'mef' } })) ??
    (await prisma.tenant.create({ data: { name: 'Ministerio de Economía y Finanzas', slug: 'mef' } }));

  const survey = await prisma.enadSurvey.upsert({
    where: { tenantId_year: { tenantId: tenant.id, year } },
    create: {
      tenantId: tenant.id,
      year,
      asOfDate,
      sourceDocument: pdfName,
    },
    update: {
      asOfDate,
      sourceDocument: pdfName,
    },
    select: { id: true, year: true, asOfDate: true, sourceDocument: true },
  });

  if (reset) {
    await prisma.enadManualAnswer.deleteMany({ where: { surveyId: survey.id } });
    await prisma.enadItem.deleteMany({ where: { surveyId: survey.id } });
    await prisma.enadRawPage.deleteMany({ where: { surveyId: survey.id } });
  }

  const extractorPath = path.resolve(process.cwd(), 'scripts', 'extract-enad.py');
  const raw = execFileSync('python', [extractorPath, pdfPath], {
    encoding: 'utf8',
    maxBuffer: 40 * 1024 * 1024,
  });

  const extracted = JSON.parse(raw) as ExtractedEnad;

  if (!reset) {
    // Avoid duplicates by clearing imported pages/items on every run.
    await prisma.enadItem.deleteMany({ where: { surveyId: survey.id } });
    await prisma.enadRawPage.deleteMany({ where: { surveyId: survey.id } });
  }

  const pagesToCreate = extracted.pages.map((p) => ({
    surveyId: survey.id,
    page: p.page,
    text: p.text ?? '',
  }));

  for (const c of chunk(pagesToCreate, 50)) {
    await prisma.enadRawPage.createMany({ data: c });
  }

  const itemsToCreate: Prisma.EnadItemCreateManyInput[] = extracted.items.map((it) => ({
    surveyId: survey.id,
    code: it.code.slice(0, 40),
    questionCode: it.questionCode,
    label: it.label ?? '',
    value1: it.value1 ? new Prisma.Decimal(it.value1) : null,
    value2: it.value2 ? new Prisma.Decimal(it.value2) : null,
    valueText: it.valueText ? String(it.valueText).slice(0, 120) : null,
  }));

  for (const c of chunk(itemsToCreate, 1000)) {
    await prisma.enadItem.createMany({ data: c });
  }

  const [pageCount, itemCount] = await Promise.all([
    prisma.enadRawPage.count({ where: { surveyId: survey.id } }),
    prisma.enadItem.count({ where: { surveyId: survey.id } }),
  ]);

  console.log(
    JSON.stringify(
      {
        tenant: tenant.slug,
        enad: {
          year: survey.year,
          asOfDate: survey.asOfDate.toISOString().slice(0, 10),
          sourceDocument: survey.sourceDocument,
        },
        imported: {
          pages: pageCount,
          items: itemCount,
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

