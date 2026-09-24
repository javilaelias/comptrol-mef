import path from 'node:path';
import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';

// Primero el .env propio (si existe) y luego el de la API, que ya trae DATABASE_URL.
cargarEnv({ quiet: true });
cargarEnv({ path: path.resolve(__dirname, '..', '..', 'api', '.env'), quiet: true });

import { PrismaPg } from '@prisma/adapter-pg';
// Igual que import-docs.ts: se usa el cliente generado en apps/api (el de la raíz del repo puede
// quedar desactualizado respecto del esquema, y la regeneración de licencias usa columnas nuevas).
import {
  Prisma,
  PrismaClient,
  IntangibleSource,
  IntangibleStatus,
} from '../../api/node_modules/@prisma/client';
// Misma logica que usa la API al subir el Excel (una sola implementacion).
import { regenerateLicensesFromIntangibles } from '../../api/src/modules/licenses/licenses-from-intangibles';
import { generateExpiryAlerts } from '../../api/src/modules/alerts/expiry-alerts';

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
  fec_fin_vida: Date | null;
  entry_doc: string | null;
  entry_date: Date | null;
  po_tipo_bien: string | null;
  po_fecha: Date | null;
  po_concepto: string | null;
  po_ano: number | null;
  po_tipo_ppto: number | null;
};

type FilaOrden = {
  ano_eje: number;
  nro_orden: number;
  tipo_bien: string;
  tipo_ppto: number;
  fecha_orden: Date | null;
  nro_contrato: string | null;
  fecha_contrato: Date | null;
  docum_referencia: string | null;
  moneda: string | null;
  tipo_cambio: string | null;
  concepto: string | null;
  resumen_compra: string | null;
  condicion_pago: string | null;
  tipo_garantia: string | null;
  plazo_entrega: number | null;
  subtotal_moneda: string | null;
  total_igv_moneda: string | null;
  total_fact_moneda: string | null;
  subtotal_soles: string | null;
  total_igv_soles: string | null;
  total_fact_soles: string | null;
  nombre_prov: string | null;
  nro_ruc: string | null;
  items: Array<{
    n: number;
    catalogo: string;
    descripcion: string | null;
    cantidad: string | null;
    unidad: string | null;
    precio_unit: string | null;
    total_moneda: string | null;
    total_soles: string | null;
    garantia: number | null;
    especificaciones: string | null;
  }> | null;
};

/** Cabecera, proveedor e ítems de las órdenes verificadas (una sola consulta por lote de claves). */
const CONSULTA_ORDENES = `
  WITH k AS (
    SELECT * FROM unnest($2::int[], $3::int[], $4::text[], $5::int[]) AS k(ano_eje, nro_orden, tipo_bien, tipo_ppto))
  SELECT o.ano_eje, o.nro_orden, o.tipo_bien, o.tipo_ppto, o.fecha_orden, o.nro_contrato, o.fecha_contrato,
         o.docum_referencia, o.moneda, o.tipo_cambio, o.concepto, o.resumen_compra, o.condicion_pago,
         o.tipo_garantia, o.plazo_entrega, o.subtotal_moneda, o.total_igv_moneda, o.total_fact_moneda,
         o.subtotal_soles, o.total_igv_soles, o.total_fact_soles, ct.nombre_prov, ct.nro_ruc, it.items
    FROM k
    JOIN sig_orden_adquisicion o
      ON o.sec_ejec = $1 AND o.ano_eje = k.ano_eje AND o.nro_orden = k.nro_orden
     AND o.tipo_bien = k.tipo_bien AND o.tipo_ppto = k.tipo_ppto
    LEFT JOIN LATERAL (
           SELECT c.nombre_prov, c.nro_ruc FROM sig_contratistas c WHERE c.proveedor = o.proveedor LIMIT 1) ct ON TRUE
    LEFT JOIN LATERAL (
           SELECT json_agg(json_build_object(
                    'n', i.sec_item,
                    'catalogo', concat_ws('.', i.grupo_bien, i.clase_bien, i.familia_bien, i.item_bien),
                    'descripcion', cb.nombre_item,
                    'cantidad', i.cant_item,
                    'unidad', um.nombre,
                    'precio_unit', i.prec_unit_moneda,
                    'total_moneda', i.prec_tot_moneda,
                    'total_soles', i.prec_tot_soles,
                    'garantia', i.plazo_garantia,
                    'especificaciones', i.especificaciones) ORDER BY i.sec_orden, i.sec_item) AS items
             FROM sig_orden_item i
             LEFT JOIN LATERAL (
                    SELECT c.nombre_item FROM catalogo_bien_serv c
                     WHERE c.grupo_bien = i.grupo_bien AND c.clase_bien = i.clase_bien
                       AND c.familia_bien = i.familia_bien AND c.item_bien = i.item_bien
                     LIMIT 1) cb ON TRUE
             LEFT JOIN unidad_medida um ON um.unidad_medida = i.unidad_medida
            WHERE i.ano_eje = o.ano_eje AND i.sec_ejec = o.sec_ejec AND i.nro_orden = o.nro_orden
              AND i.tipo_bien = o.tipo_bien AND i.tipo_ppto = o.tipo_ppto) it ON TRUE`;

const claveOrden = (ano: number, nro: number, tipo: string, ppto: number) => `${ano}|${nro}|${tipo}|${ppto}`;

const num = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined || v === '' ? null : Number(v);

const fecha = (v: Date | null) => (v ? v.toISOString().slice(0, 10) : null);

/** Orden de SIGA como se guarda en `po_detail` (claves en inglés, montos como número). */
function detalleOrden(o: FilaOrden) {
  return {
    kind: o.tipo_bien === 'B' ? 'OC' : 'OS',
    year: o.ano_eje,
    number: o.nro_orden,
    date: fecha(o.fecha_orden),
    contract: texto(o.nro_contrato, 60),
    contractDate: fecha(o.fecha_contrato),
    reference: texto(o.docum_referencia, 100),
    currency: texto(o.moneda, 6),
    exchangeRate: num(o.tipo_cambio),
    subject: texto(o.concepto, 2000),
    summary: texto(o.resumen_compra, 500),
    paymentTerms: texto(o.condicion_pago, 120),
    warranty: texto(o.tipo_garantia, 120),
    deliveryDays: o.plazo_entrega,
    supplier: { name: texto(o.nombre_prov, 250), ruc: texto(o.nro_ruc, 20) },
    subtotal: num(o.subtotal_moneda),
    tax: num(o.total_igv_moneda),
    total: num(o.total_fact_moneda),
    totalSoles: num(o.total_fact_soles),
    items: (o.items ?? []).map((i) => ({
      n: i.n,
      catalogCode: i.catalogo,
      description: texto(i.descripcion, 500),
      quantity: num(i.cantidad),
      unit: texto(i.unidad, 60),
      unitPrice: num(i.precio_unit),
      total: num(i.total_moneda),
      warrantyDays: i.garantia || null,
      specs: texto(i.especificaciones, 4000),
    })),
  };
}

const CONSULTA = `
  SELECT p.codigo_activo, p.codigo_barra, p.descripcion, p.modelo, mk.nombre AS marca_nombre,
         p.estado, p.nro_orden, ct.nombre_prov, ct.nro_ruc, p.nro_contrato,
         p.fecha_alta, p.valor_inicial,
         sd.nombre AS sede_nombre, cc.nombre_depend, ub.ubicac_fisica,
         p.fec_fin_vida, md.nombre AS entry_doc, COALESCE(p.fecha_compra, p.fecha_nea) AS entry_date,
         oc.tipo_bien AS po_tipo_bien, oc.fecha_orden AS po_fecha, oc.concepto AS po_concepto,
         oc.ano_eje AS po_ano, oc.tipo_ppto AS po_tipo_ppto
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
    LEFT JOIN maestro_documento md ON md.cod_doc = p.tipo_doc_refer
    -- SIGA no guarda el año de la orden: solo se acepta una orden de ese número, del año de compra
    -- o el anterior, que contenga el mismo ítem de catálogo. El cruce solo por número trae órdenes
    -- de otra cosa (ej. 140400030005 → OC 553-2013 es de cableado).
    LEFT JOIN LATERAL (
           SELECT o.ano_eje, o.tipo_ppto, o.tipo_bien, o.fecha_orden, o.concepto FROM sig_orden_adquisicion o
            WHERE o.sec_ejec = p.sec_ejec AND o.nro_orden = p.nro_orden AND o.tipo_bien IN ('B', 'S')
              AND o.ano_eje BETWEEN extract(year FROM COALESCE(p.fecha_compra, p.fecha_alta)) - 1
                                AND extract(year FROM COALESCE(p.fecha_compra, p.fecha_alta))
              AND EXISTS (
                    SELECT 1 FROM sig_orden_item i
                     WHERE i.ano_eje = o.ano_eje AND i.sec_ejec = o.sec_ejec AND i.nro_orden = o.nro_orden
                       AND i.tipo_bien = o.tipo_bien AND i.tipo_ppto = o.tipo_ppto
                       AND i.grupo_bien = p.grupo_bien AND i.clase_bien = p.clase_bien
                       AND i.familia_bien = p.familia_bien AND i.item_bien = p.item_bien)
            ORDER BY abs(extract(epoch FROM COALESCE(p.fecha_compra, p.fecha_alta) - o.fecha_orden))
            LIMIT 1) oc ON COALESCE(p.nro_orden, 0) <> 0
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

    // Órdenes verificadas distintas → cabecera + ítems en una sola consulta.
    const claves = new Map<string, [number, number, string, number]>();
    for (const r of rows) {
      if (r.po_tipo_bien && r.po_ano !== null && r.po_tipo_ppto !== null && r.nro_orden) {
        claves.set(claveOrden(r.po_ano, r.nro_orden, r.po_tipo_bien, r.po_tipo_ppto), [
          r.po_ano,
          r.nro_orden,
          r.po_tipo_bien,
          r.po_tipo_ppto,
        ]);
      }
    }
    const k = [...claves.values()];
    const { rows: ordenes } = await siga.query<FilaOrden>(CONSULTA_ORDENES, [
      SEC_EJEC_MEF,
      k.map((x) => x[0]),
      k.map((x) => x[1]),
      k.map((x) => x[2]),
      k.map((x) => x[3]),
    ]);
    const detalles = new Map(
      ordenes.map((o) => [claveOrden(o.ano_eje, o.nro_orden, o.tipo_bien, o.tipo_ppto), detalleOrden(o)]),
    );
    console.log(`SIGA: ${detalles.size} ordenes verificadas con su detalle`);

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
        endOfLifeAt: r.fec_fin_vida,
        entryDoc: texto(r.entry_doc, 150),
        entryDate: r.entry_date,
        poKind: r.po_tipo_bien === 'B' ? 'OC' : r.po_tipo_bien === 'S' ? 'OS' : null,
        poDate: r.po_fecha,
        poSubject: texto(r.po_concepto, 2000),
        poVerified: r.nro_orden ? r.po_tipo_bien !== null : null,
        poDetail:
          r.po_tipo_bien && r.po_ano !== null && r.po_tipo_ppto !== null && r.nro_orden
            ? (detalles.get(claveOrden(r.po_ano, r.nro_orden, r.po_tipo_bien, r.po_tipo_ppto)) ?? Prisma.DbNull)
            : Prisma.DbNull,
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

    // Las licencias agrupadas desde intangibles se recalculan con la version nueva.
    const licencias = await regenerateLicensesFromIntangibles(prisma, tenant.id);
    console.log(
      `Licencias desde intangibles: ${licencias.groups} grupos ` +
        `(${licencias.created} nuevas, ${licencias.updated} actualizadas, ${licencias.retired} retiradas)`,
    );
    const alertas = await generateExpiryAlerts(prisma, tenant.id);
    console.log(`Alertas de vencimiento: ${alertas.created} nuevas, ${alertas.autoResolved} cerradas solas`);
  } finally {
    await siga.end();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
