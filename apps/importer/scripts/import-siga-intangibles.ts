import path from 'node:path';
import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';

// Primero el .env propio (si existe) y luego el de la API, que ya trae DATABASE_URL.
cargarEnv({ quiet: true });
cargarEnv({ path: path.resolve(__dirname, '..', '..', 'api', '.env'), quiet: true });

import { PrismaPg } from '@prisma/adapter-pg';
// El cliente se genera desde el esquema de la API (ver el script import:siga-intangibles del package.json).
import { Prisma, PrismaClient, IntangibleSource, IntangibleStatus } from '@prisma/client';

/**
 * Carga los bienes intangibles de SIGA (licencias y software: grupo 14, clase 04) como una
 * version nueva del modulo "Intangibles", con la fecha de corte indicada en SIGA_CUT_DATE.
 *
 * No toca la tabla de activos: los intangibles viven en intangible_batches/intangible_records.
 * Cada corte es una version inmutable; repetir un corte existente falla salvo SIGA_REPLACE=1.
 */

const SEC_EJEC_MEF = 46;
const TENANT_SLUG = 'mef';
const LOTE = 1000;

type FilaSiga = {
  codigo_activo: string;
  codigo_barra: string | null;
  descripcion: string | null;
  modelo: string | null;
  marca_nombre: string | null;
  estado: string | null;
  nro_orden: number | null;
  nombre_prov: string | null;
  nro_ruc: string | null;
  nro_contrato: string | null;
  fecha_alta: Date | null;
  valor_inicial: string | null;
  sede_nombre: string | null;
  nombre_depend: string | null;
  ubicac_fisica: string | null;
};

const CONSULTA = `
  SELECT p.codigo_activo, p.codigo_barra, p.descripcion, p.modelo, mk.nombre AS marca_nombre,
         p.estado, p.nro_orden, ct.nombre_prov, ct.nro_ruc, p.nro_contrato,
         p.fecha_alta, p.valor_inicial,
         sd.nombre AS sede_nombre, cc.nombre_depend, ub.ubicac_fisica
    FROM sig_patrimonio p
    LEFT JOIN LATERAL (
           SELECT m.nombre FROM marca m
            WHERE m.marca = p.marca
            ORDER BY (m.tipo_marca = p.tipo_marca) DESC NULLS LAST
            LIMIT 1) mk ON TRUE
    LEFT JOIN LATERAL (
           SELECT c.nombre_prov, c.nro_ruc FROM sig_contratistas c
            WHERE c.proveedor = p.proveedor
            LIMIT 1) ct ON TRUE
    LEFT JOIN LATERAL (
           SELECT s.nombre_depend FROM sig_centro_costo s
            WHERE s.sec_ejec = p.sec_ejec AND s.centro_costo = p.centro_costo
            ORDER BY s.ano_eje DESC
            LIMIT 1) cc ON TRUE
    LEFT JOIN tmp_sede sd ON sd.sec_ejec = p.sec_ejec AND sd.sede_id = p.sede
    LEFT JOIN sig_ubicac_fisica ub ON ub.tipo_ubicac = p.tipo_ubicac AND ub.cod_ubicac = p.cod_ubicac
   WHERE p.sec_ejec = $1 AND p.grupo_bien = '14' AND p.clase_bien = '04'
     AND p.codigo_activo IS NOT NULL
   ORDER BY p.codigo_activo`;

function texto(valor: string | null | undefined, max: number): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).replace(/\s+/g, ' ').trim();
  return limpio ? limpio.slice(0, max) : null;
}

function envFlag(nombre: string, porDefecto: boolean): boolean {
  const v = process.env[nombre];
  if (v === undefined || v === '') return porDefecto;
  return ['1', 'true', 'si', 'sí', 'yes'].includes(v.toLowerCase());
}

function fechaCorte(): Date {
  const v = process.env.SIGA_CUT_DATE ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error('Falta SIGA_CUT_DATE=YYYY-MM-DD (fecha de corte del dump de SIGA)');
  }
  return new Date(`${v}T00:00:00Z`);
}

async function main() {
  const comptrolUrl = process.env.DATABASE_URL;
  const sigaUrl = process.env.SIGA_DATABASE_URL;
  if (!comptrolUrl) throw new Error('Falta DATABASE_URL (base de Comptrol)');
  if (!sigaUrl) throw new Error('Falta SIGA_DATABASE_URL (base con el dump de SIGA)');
  const corte = fechaCorte();
  const reemplazar = envFlag('SIGA_REPLACE', false);

  const siga = new Client({ connectionString: sigaUrl });
  await siga.connect();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: comptrolUrl }) });

  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
    if (!tenant) throw new Error(`No existe el tenant '${TENANT_SLUG}' en Comptrol`);

    const existente = await prisma.intangibleBatch.findFirst({
      where: { tenantId: tenant.id, source: IntangibleSource.siga, cutDate: corte },
    });
    if (existente && !reemplazar) {
      throw new Error(
        `Ya existe una version de SIGA con corte ${process.env.SIGA_CUT_DATE}. ` +
          'Usa SIGA_REPLACE=1 para reemplazarla.',
      );
    }

    const { rows } = await siga.query<FilaSiga>(CONSULTA, [SEC_EJEC_MEF]);
    console.log(`SIGA: ${rows.length} bienes intangibles leidos`);
    if (!rows.length) throw new Error('SIGA no devolvio intangibles; no se crea ninguna version');

    const registros = rows.map((r) => {
      const valor = r.valor_inicial === null ? null : new Prisma.Decimal(r.valor_inicial);
      return {
        patrimonialCode: r.codigo_activo.trim(),
        inventoryCode: texto(r.codigo_barra, 40),
        description: texto(r.descripcion, 2000),
        brand: texto(r.marca_nombre, 120),
        model: texto(r.modelo, 120),
        status: r.estado === '2' ? IntangibleStatus.retired : IntangibleStatus.active,
        // SIGA usa 0 como "sin orden"; se guarda vacio para no generar diferencias falsas.
        poNumber: r.nro_orden ? r.nro_orden : null,
        // ano_eje es el año de proceso del corte, no el de la OC: se usa el año de alta (concilio H6).
        poYear: r.nro_orden && r.fecha_alta ? r.fecha_alta.getFullYear() : null,
        supplierName: texto(r.nombre_prov, 250),
        supplierRuc: texto(r.nro_ruc, 20),
        contractNumber: texto(r.nro_contrato, 60),
        registeredAt: r.fecha_alta,
        initialValue: valor,
        siteName: texto(r.sede_nombre, 160),
        orgUnit: texto(r.nombre_depend, 250),
        physicalLocation: texto(r.ubicac_fisica, 300),
      };
    });

    const vigentes = registros.filter((r) => r.status === IntangibleStatus.active).length;

    const batch = await prisma.$transaction(
      async (tx) => {
        if (existente) await tx.intangibleBatch.delete({ where: { id: existente.id } });
        await tx.intangibleBatch.updateMany({
          where: { tenantId: tenant.id, source: IntangibleSource.siga, isCurrent: true },
          data: { isCurrent: false },
        });
        const creado = await tx.intangibleBatch.create({
          data: {
            tenantId: tenant.id,
            source: IntangibleSource.siga,
            cutDate: corte,
            fileName: 'siga (script import:siga-intangibles)',
            rowCount: registros.length,
            isCurrent: true,
          },
        });
        for (let i = 0; i < registros.length; i += LOTE) {
          await tx.intangibleRecord.createMany({
            data: registros.slice(i, i + LOTE).map((r) => ({ ...r, batchId: creado.id })),
          });
        }
        return creado;
      },
      { timeout: 300_000 },
    );

    console.log(
      `Version SIGA ${process.env.SIGA_CUT_DATE} creada (${batch.id}): ${registros.length} bienes ` +
        `(${vigentes} vigentes, ${registros.length - vigentes} de baja)` +
        (existente ? ' — reemplazo la version anterior del mismo corte' : ''),
    );
  } finally {
    await siga.end();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
