import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { IntangiblesService } from './intangibles.service';
import {
  paged,
  currentRecordsCte,
  expiryBucketSql,
  normText,
  suspiciousAccountSql,
} from './intangibles.sql';

export const RECONCILIATION_VIEWS = [
  'only-siga',
  'only-excel',
  'field-diffs',
  'po-counts',
  'pending',
  'expiry',
] as const;
export type ReconciliationView = (typeof RECONCILIATION_VIEWS)[number];

export type ViewFilters = {
  search?: string;
  /** only-siga: active | retired · pending: no_condition | defined_no_expiry · expiry: expired | expiring | valid */
  subset?: string;
  suspicious?: boolean;
  /** po-counts: solo las OC con diferencia */
  onlyDiff?: boolean;
  take: number;
  skip: number;
};

type Row = Record<string, unknown>;

const EXPORT_MAX_ROWS = 50_000;

/** Columnas de cada vista para la exportación: [clave en la fila, título]. */
const EXPORT_COLUMNS: Record<
  Exclude<ReconciliationView, 'pending'>,
  Array<[string, string]>
> = {
  'only-siga': [
    ['code', 'Código patrimonial'],
    ['status', 'Estado en SIGA'],
    ['description', 'Descripción'],
    ['po_number', 'N° OC'],
    ['po_year', 'Año OC'],
    ['supplier', 'Proveedor (SIGA)'],
    ['registered_at', 'Fecha de alta'],
    ['initial_value', 'Valor inicial'],
  ],
  'only-excel': [
    ['code', 'Código patrimonial'],
    ['description', 'Descripción'],
    ['po_number', 'N° OC'],
    ['supplier', 'Proveedor (Excel)'],
    ['registered_at', 'Fecha de alta'],
    ['initial_value', 'Valor inicial'],
    ['condition', 'Condición'],
    ['expires_at', 'Fecha de vencimiento'],
    ['account_flag', 'Observación de cuenta'],
  ],
  'field-diffs': [
    ['code', 'Código patrimonial'],
    ['description', 'Descripción (SIGA)'],
    ['field', 'Campo'],
    ['siga_value', 'Valor en SIGA'],
    ['excel_value', 'Valor en Excel'],
    ['account_flag', 'Observación de cuenta'],
  ],
  'po-counts': [
    ['po_number', 'N° OC'],
    ['po_year', 'Año (de alta)'],
    ['siga_count', 'Bienes en SIGA'],
    ['excel_count', 'Bienes en Excel'],
    ['difference', 'Diferencia (Excel - SIGA)'],
    ['sample_description', 'Ejemplo de bien'],
  ],
  expiry: [
    ['code', 'Código patrimonial'],
    ['description', 'Descripción'],
    ['condition', 'Condición'],
    ['expires_at', 'Fecha de vencimiento'],
    ['bucket_label', 'Situación'],
    ['po_number', 'N° OC'],
    ['supplier', 'Proveedor (Excel)'],
    ['account_flag', 'Observación de cuenta'],
  ],
};

const VIEW_TITLES: Record<ReconciliationView, string> = {
  'only-siga': 'Solo en SIGA',
  'only-excel': 'Solo en Excel',
  'field-diffs': 'Campos distintos',
  'po-counts': 'Cantidades por OC',
  pending: 'Pendientes del coordinador',
  expiry: 'Vencimientos',
};

export const SUSPICIOUS_ACCOUNT_TEXT =
  'Posible error de cuenta: intangible registrado como mueble no depreciable';

/** Evita que un texto se interprete como fórmula al abrir el archivo en Excel. */
export function safeCell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intangibles: IntangiblesService,
  ) {}

  assertView(view: string): ReconciliationView {
    if (!(RECONCILIATION_VIEWS as readonly string[]).includes(view)) {
      throw new BadRequestException(`Vista desconocida: ${view}`);
    }
    return view as ReconciliationView;
  }

  async summary(tenantId: string) {
    const [counts] = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)}
      SELECT
        (SELECT count(*) FROM s WHERE s.status = 'active' AND NOT EXISTS (SELECT 1 FROM c WHERE c.patrimonial_code = s.patrimonial_code))::int AS only_siga_active,
        (SELECT count(*) FROM s WHERE s.status = 'retired' AND NOT EXISTS (SELECT 1 FROM c WHERE c.patrimonial_code = s.patrimonial_code))::int AS only_siga_retired,
        (SELECT count(*) FROM c WHERE NOT EXISTS (SELECT 1 FROM s WHERE s.patrimonial_code = c.patrimonial_code))::int AS only_excel,
        (SELECT count(*) FROM c LEFT JOIN s ON s.patrimonial_code = c.patrimonial_code
          WHERE COALESCE(s.status::text, 'active') = 'active' AND c.condition_norm IS NULL)::int AS pending_no_condition,
        (SELECT count(*) FROM c LEFT JOIN s ON s.patrimonial_code = c.patrimonial_code
          WHERE COALESCE(s.status::text, 'active') = 'active' AND c.condition_norm = 'VIDA ÚTIL DEFINIDA' AND c.expires_at IS NULL)::int AS pending_defined_no_expiry,
        (SELECT count(*) FROM c WHERE ${suspiciousAccountSql})::int AS suspicious_account`;

    const [expiry] = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)}
      SELECT count(*) FILTER (WHERE b = 'expired')::int AS expired,
             count(*) FILTER (WHERE b = 'expiring')::int AS expiring,
             count(*) FILTER (WHERE b = 'valid')::int AS valid
        FROM (SELECT ${expiryBucketSql} AS b FROM c LEFT JOIN s ON s.patrimonial_code = c.patrimonial_code
               WHERE c.expires_at IS NOT NULL AND COALESCE(s.status::text, 'active') = 'active') t`;

    const diffs = await this.fieldDiffs(tenantId, { take: 1, skip: 0 });
    const po = await this.poCounts(tenantId, {
      take: 1,
      skip: 0,
      onlyDiff: true,
    });

    return {
      cuts: await this.intangibles.currentCuts(tenantId),
      counts: {
        onlySiga: {
          active: counts.only_siga_active,
          retired: counts.only_siga_retired,
        },
        onlyExcel: counts.only_excel,
        fieldDiffs: diffs.total,
        poCountsWithDifference: po.total,
        pending: {
          noCondition: counts.pending_no_condition,
          definedNoExpiry: counts.pending_defined_no_expiry,
        },
        expiry,
        suspiciousAccount: counts.suspicious_account,
      },
    };
  }

  async view(tenantId: string, view: ReconciliationView, f: ViewFilters) {
    switch (view) {
      case 'only-siga':
        return this.onlySiga(tenantId, f);
      case 'only-excel':
        return this.onlyExcel(tenantId, f);
      case 'field-diffs':
        return this.fieldDiffs(tenantId, f);
      case 'po-counts':
        return this.poCounts(tenantId, f);
      case 'pending':
        return this.pending(tenantId, f);
      case 'expiry':
        return this.expiry(tenantId, f);
    }
  }

  private searchSql(
    f: ViewFilters,
    code: Prisma.Sql,
    description: Prisma.Sql,
  ): Prisma.Sql {
    if (!f.search?.trim()) return Prisma.sql`TRUE`;
    const q = `%${f.search.trim()}%`;
    return Prisma.sql`(${code} ILIKE ${q} OR ${description} ILIKE ${q})`;
  }

  private async onlySiga(tenantId: string, f: ViewFilters) {
    const status =
      f.subset === 'active' || f.subset === 'retired' ? f.subset : null;
    const rows = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)}
      SELECT s.patrimonial_code AS code, s.status::text AS status, s.description, s.po_number, s.po_year,
             s.supplier_name AS supplier, to_char(s.registered_at, 'YYYY-MM-DD') AS registered_at,
             s.initial_value::float8 AS initial_value, count(*) OVER ()::int AS total
        FROM s
       WHERE NOT EXISTS (SELECT 1 FROM c WHERE c.patrimonial_code = s.patrimonial_code)
         AND (${status}::text IS NULL OR s.status::text = ${status})
         AND ${this.searchSql(f, Prisma.sql`s.patrimonial_code`, Prisma.sql`s.description`)}
       ORDER BY s.status, s.patrimonial_code
       LIMIT ${f.take} OFFSET ${f.skip}`;
    return paged(rows);
  }

  private async onlyExcel(tenantId: string, f: ViewFilters) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)}
      SELECT c.patrimonial_code AS code, c.description, c.po_number, c.supplier_name AS supplier,
             to_char(c.registered_at, 'YYYY-MM-DD') AS registered_at, c.initial_value::float8 AS initial_value,
             c.condition_norm AS condition, to_char(c.expires_at, 'YYYY-MM-DD') AS expires_at,
             ${suspiciousAccountSql} AS suspicious_account, count(*) OVER ()::int AS total
        FROM c
       WHERE NOT EXISTS (SELECT 1 FROM s WHERE s.patrimonial_code = c.patrimonial_code)
         AND (${!!f.suspicious} = false OR ${suspiciousAccountSql})
         AND ${this.searchSql(f, Prisma.sql`c.patrimonial_code`, Prisma.sql`c.description`)}
       ORDER BY c.patrimonial_code
       LIMIT ${f.take} OFFSET ${f.skip}`;
    return paged(rows);
  }

  /**
   * Una fila por (bien, campo distinto). SIGA es la referencia de los datos base; el proveedor no
   * se compara porque la razón social se escribe distinto en cada fuente (concilio H5).
   */
  private async fieldDiffs(tenantId: string, f: ViewFilters) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)}
      SELECT s.patrimonial_code AS code, s.description, d.field, d.siga_value, d.excel_value,
             ${suspiciousAccountSql} AS suspicious_account, count(*) OVER ()::int AS total
        FROM s JOIN c ON c.patrimonial_code = s.patrimonial_code
        CROSS JOIN LATERAL (VALUES
          ('Descripción', s.description, c.description,
             ${normText(Prisma.sql`s.description`)} IS DISTINCT FROM ${normText(Prisma.sql`c.description`)}),
          ('Código de inventario', s.inventory_code, c.inventory_code,
             ${normText(Prisma.sql`s.inventory_code`)} IS DISTINCT FROM ${normText(Prisma.sql`c.inventory_code`)}),
          ('N° de OC', s.po_number::text, c.po_number::text, s.po_number IS DISTINCT FROM c.po_number),
          ('Fecha de alta', to_char(s.registered_at, 'YYYY-MM-DD'), to_char(c.registered_at, 'YYYY-MM-DD'),
             s.registered_at IS DISTINCT FROM c.registered_at),
          ('Valor inicial', s.initial_value::text, c.initial_value::text,
             COALESCE(abs(s.initial_value - c.initial_value) > 0.01, (s.initial_value IS NULL) <> (c.initial_value IS NULL)))
        ) AS d(field, siga_value, excel_value, differs)
       WHERE d.differs
         AND (${!!f.suspicious} = false OR ${suspiciousAccountSql})
         AND ${this.searchSql(f, Prisma.sql`s.patrimonial_code`, Prisma.sql`s.description`)}
       ORDER BY s.patrimonial_code, d.field
       LIMIT ${f.take} OFFSET ${f.skip}`;
    return paged(rows);
  }

  /** Bienes vigentes por OC + año de alta en cada fuente (el Excel solo trae vigentes). */
  private async poCounts(tenantId: string, f: ViewFilters) {
    const rows = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)},
      sa AS (SELECT po_number, po_year, count(*)::int AS n, min(description) AS d
               FROM s WHERE po_number IS NOT NULL AND status = 'active' GROUP BY 1, 2),
      ca AS (SELECT po_number, po_year, count(*)::int AS n, min(description) AS d
               FROM c WHERE po_number IS NOT NULL GROUP BY 1, 2),
      j AS (SELECT COALESCE(sa.po_number, ca.po_number) AS po_number, COALESCE(sa.po_year, ca.po_year) AS po_year,
                   COALESCE(sa.n, 0) AS siga_count, COALESCE(ca.n, 0) AS excel_count,
                   COALESCE(ca.n, 0) - COALESCE(sa.n, 0) AS difference, COALESCE(sa.d, ca.d) AS sample_description
              FROM sa FULL JOIN ca ON ca.po_number = sa.po_number AND ca.po_year IS NOT DISTINCT FROM sa.po_year)
      SELECT j.*, count(*) OVER ()::int AS total FROM j
       WHERE (${!!f.onlyDiff} = false OR j.difference <> 0)
         AND (${f.search?.trim() || null}::text IS NULL OR j.po_number::text = ${f.search?.trim() ?? ''}
              OR j.sample_description ILIKE ${`%${f.search?.trim() ?? ''}%`})
       ORDER BY abs(j.difference) DESC, j.po_year DESC NULLS LAST, j.po_number
       LIMIT ${f.take} OFFSET ${f.skip}`;
    return paged(rows);
  }

  private async pending(tenantId: string, f: ViewFilters) {
    const subset =
      f.subset === 'no_condition' || f.subset === 'defined_no_expiry'
        ? f.subset
        : null;
    const rows = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)}
      SELECT * , count(*) OVER ()::int AS total FROM (
        SELECT c.patrimonial_code AS code, c.description, c.condition_raw, c.po_number,
               CASE WHEN c.condition_norm IS NULL THEN 'no_condition' ELSE 'defined_no_expiry' END AS reason,
               ${suspiciousAccountSql} AS suspicious_account, c.row_number, c.raw
          FROM c LEFT JOIN s ON s.patrimonial_code = c.patrimonial_code
         WHERE COALESCE(s.status::text, 'active') = 'active'
           AND (c.condition_norm IS NULL OR (c.condition_norm = 'VIDA ÚTIL DEFINIDA' AND c.expires_at IS NULL))
      ) p
       WHERE (${subset}::text IS NULL OR p.reason = ${subset})
         AND (${!!f.suspicious} = false OR p.suspicious_account)
         AND ${this.searchSql(f, Prisma.sql`p.code`, Prisma.sql`p.description`)}
       ORDER BY p.row_number
       LIMIT ${f.take} OFFSET ${f.skip}`;
    return paged(rows);
  }

  private async expiry(tenantId: string, f: ViewFilters) {
    const bucket = ['expired', 'expiring', 'valid'].includes(f.subset ?? '')
      ? f.subset!
      : null;
    const rows = await this.prisma.$queryRaw<Row[]>`
      ${currentRecordsCte(tenantId)}
      SELECT *, count(*) OVER ()::int AS total FROM (
        SELECT c.patrimonial_code AS code, c.description, c.condition_norm AS condition,
               to_char(c.expires_at, 'YYYY-MM-DD') AS expires_at, c.expires_at AS expires_on,
               ${expiryBucketSql} AS bucket, c.po_number, c.supplier_name AS supplier,
               ${suspiciousAccountSql} AS suspicious_account
          FROM c LEFT JOIN s ON s.patrimonial_code = c.patrimonial_code
         WHERE c.expires_at IS NOT NULL AND COALESCE(s.status::text, 'active') = 'active'
      ) e
       WHERE (${bucket}::text IS NULL OR e.bucket = ${bucket})
         AND (${!!f.suspicious} = false OR e.suspicious_account)
         AND ${this.searchSql(f, Prisma.sql`e.code`, Prisma.sql`e.description`)}
       ORDER BY e.expires_on, e.code
       LIMIT ${f.take} OFFSET ${f.skip}`;
    const result = paged(rows);
    result.items.forEach((item) => delete item.expires_on);
    return result;
  }

  async export(
    tenantId: string,
    view: ReconciliationView,
    f: Omit<ViewFilters, 'take' | 'skip'>,
  ) {
    const result = await this.view(tenantId, view, {
      ...f,
      take: EXPORT_MAX_ROWS,
      skip: 0,
    });
    const cuts = await this.intangibles.currentCuts(tenantId);
    const bucketLabel: Record<string, string> = {
      expired: 'Vencido',
      expiring: 'Por vencer',
      valid: 'Vigente',
    };
    const reasonLabel: Record<string, string> = {
      no_condition: 'Sin condición',
      defined_no_expiry: 'Vida útil definida sin fecha de vencimiento',
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Comptrol-MEF';
    const ws = wb.addWorksheet('Datos');
    ws.addRow([`Intangibles — ${VIEW_TITLES[view]}`]).font = {
      bold: true,
      size: 13,
    };
    ws.addRow([`Corte SIGA: ${cuts.siga?.cutDate ?? 'sin carga'}`]);
    ws.addRow([
      `Corte Excel del coordinador: ${cuts.coordinator?.cutDate ?? 'sin carga'}${cuts.coordinator?.fileName ? ` (${cuts.coordinator.fileName})` : ''}`,
    ]);
    ws.addRow([
      `Generado: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC · ${result.total} filas`,
    ]);
    ws.addRow([]);

    let columns: Array<[string, string]>;
    let rows: Row[] = result.items;
    if (view === 'pending') {
      // Se devuelven las columnas originales del Excel para que el coordinador lo complete.
      const headers = await this.coordinatorHeaders(tenantId);
      columns = [
        ['reason_label', 'Motivo'],
        ['account_flag', 'Observación de cuenta'],
        ...headers.map((h): [string, string] => [`raw:${h}`, h]),
      ];
      rows = rows.map((r) => {
        const raw = (r.raw ?? {}) as Row;
        const out: Row = {
          reason_label: reasonLabel[String(r.reason)] ?? r.reason,
        };
        for (const h of headers) out[`raw:${h}`] = raw[h];
        return { ...out, suspicious_account: r.suspicious_account };
      });
    } else {
      columns = EXPORT_COLUMNS[view];
      rows = rows.map((r) => ({
        ...r,
        bucket_label: bucketLabel[String(r.bucket)] ?? null,
      }));
    }

    const header = ws.addRow(columns.map(([, title]) => title));
    header.font = { bold: true };
    for (const r of rows) {
      const flagged = {
        ...r,
        account_flag: r.suspicious_account ? SUSPICIOUS_ACCOUNT_TEXT : null,
      };
      ws.addRow(columns.map(([key]) => safeCell(flagged[key])));
    }
    columns.forEach((_, i) => (ws.getColumn(i + 1).width = i === 0 ? 20 : 24));

    return {
      fileName: `intangibles-${view}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    };
  }

  private async coordinatorHeaders(tenantId: string): Promise<string[]> {
    const batch = await this.prisma.intangibleBatch.findFirst({
      where: { tenantId, source: 'coordinator', isCurrent: true },
      select: { warnings: true },
    });
    const report = (batch?.warnings ?? {}) as { headers?: string[] };
    return report.headers ?? [];
  }
}
