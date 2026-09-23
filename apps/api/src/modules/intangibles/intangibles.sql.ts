import { Prisma } from '@prisma/client';

/** Ventana de "por vencer" (días). Cuando exista el módulo de alertas se tomará de sus reglas. */
export const EXPIRING_DAYS = 90;

/**
 * CTE con los registros de las versiones vigentes: `s` = SIGA, `c` = Excel del coordinador.
 * Toda consulta de intangibles parte de aquí para comparar siempre vigente contra vigente.
 */
export function currentRecordsCte(tenantId: string): Prisma.Sql {
  return Prisma.sql`
    WITH s AS (
      SELECT r.* FROM intangible_records r
        JOIN intangible_batches b ON b.id = r.batch_id
       WHERE b.tenant_id = ${tenantId}::uuid AND b.is_current AND b.source = 'siga'
    ), c AS (
      SELECT r.* FROM intangible_records r
        JOIN intangible_batches b ON b.id = r.batch_id
       WHERE b.tenant_id = ${tenantId}::uuid AND b.is_current AND b.source = 'coordinator'
    )`;
}

/** Cuenta contable del Excel que sugiere un error: un intangible registrado como mueble no depreciable. */
export const suspiciousAccountSql = Prisma.sql`COALESCE(upper(c.account_name) LIKE 'MUEBLES Y ENSERES NO DEPRECIABLE%', false)`;

export const expiryBucketSql = Prisma.sql`CASE
  WHEN c.expires_at IS NULL THEN 'none'
  WHEN c.expires_at < current_date THEN 'expired'
  WHEN c.expires_at <= current_date + ${EXPIRING_DAYS}::int THEN 'expiring'
  ELSE 'valid' END`;

/** Texto comparable: sin espacios de más y en mayúsculas. */
export function normText(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`NULLIF(upper(regexp_replace(btrim(${column}), '\\s+', ' ', 'g')), '')`;
}

/** Separa la columna `total` (del `count(*) OVER ()`) de cada fila. */
export function paged(rows: Array<Record<string, unknown>>) {
  return {
    total: rows.length ? Number(rows[0].total) : 0,
    items: rows.map((row) => {
      const item = { ...row };
      delete item.total;
      return item;
    }),
  };
}
