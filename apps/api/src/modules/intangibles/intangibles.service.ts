import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntangibleSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CoordinatorExcelError,
  parseCoordinatorExcel,
} from './coordinator-excel.parser';
import {
  paged,
  currentRecordsCte,
  expiryBucketSql,
  EXPIRING_DAYS,
  suspiciousAccountSql,
} from './intangibles.sql';

export type IntangibleListFilters = {
  search?: string;
  status?: 'active' | 'retired' | 'excel_only';
  condition?: 'definida' | 'indefinida' | 'none';
  expiry?: 'expired' | 'expiring' | 'valid' | 'none';
  suspicious?: boolean;
  take: number;
  skip: number;
};

const XLSX_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

@Injectable()
export class IntangiblesService {
  constructor(private readonly prisma: PrismaService) {}

  async listBatches(tenantId: string) {
    const batches = await this.prisma.intangibleBatch.findMany({
      where: { tenantId },
      orderBy: [{ source: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        source: true,
        cutDate: true,
        fileName: true,
        rowCount: true,
        isCurrent: true,
        createdAt: true,
        warnings: true,
        uploadedBy: { select: { fullName: true, email: true } },
      },
    });
    return batches.map(({ warnings, ...b }) => {
      const report = (warnings ?? {}) as {
        discarded?: number;
        items?: unknown[];
      };
      return {
        ...b,
        cutDate: b.cutDate.toISOString().slice(0, 10),
        discarded: report.discarded ?? 0,
        warningCount: report.items?.length ?? 0,
      };
    });
  }

  async uploadCoordinator(
    tenantId: string,
    actorUserId: string,
    file: Express.Multer.File | undefined,
    cutDate: string,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo (.xlsx).');
    const fileName = (file.originalname ?? 'archivo.xlsx')
      .split(/[\\/]/)
      .pop()!
      .slice(0, 200);
    if (
      !/\.xlsx$/i.test(fileName) ||
      !file.buffer.subarray(0, 4).equals(XLSX_SIGNATURE)
    ) {
      throw new BadRequestException('Solo se aceptan archivos Excel .xlsx.');
    }

    let parsed: Awaited<ReturnType<typeof parseCoordinatorExcel>>;
    try {
      parsed = await parseCoordinatorExcel(file.buffer);
    } catch (err) {
      if (err instanceof CoordinatorExcelError) {
        throw new BadRequestException({
          message: err.message,
          missingColumns: err.missingColumns,
        });
      }
      throw err;
    }
    if (!parsed.rows.length)
      throw new BadRequestException(
        'El archivo no tiene filas con código patrimonial.',
      );

    const report = {
      headers: parsed.headers,
      discarded: parsed.discarded,
      items: parsed.warnings,
    };
    const batch = await this.prisma.$transaction(
      async (tx) => {
        await tx.intangibleBatch.updateMany({
          where: {
            tenantId,
            source: IntangibleSource.coordinator,
            isCurrent: true,
          },
          data: { isCurrent: false },
        });
        const created = await tx.intangibleBatch.create({
          data: {
            tenantId,
            source: IntangibleSource.coordinator,
            cutDate: new Date(`${cutDate}T00:00:00Z`),
            fileName,
            uploadedById: actorUserId,
            rowCount: parsed.rows.length,
            warnings: report as Prisma.InputJsonValue,
            isCurrent: true,
          },
        });
        for (let i = 0; i < parsed.rows.length; i += 1000) {
          await tx.intangibleRecord.createMany({
            data: parsed.rows.slice(i, i + 1000).map((r) => ({
              ...r,
              batchId: created.id,
              initialValue:
                r.initialValue === null
                  ? null
                  : new Prisma.Decimal(r.initialValue.toFixed(2)),
              raw: r.raw as Prisma.InputJsonValue,
            })),
          });
        }
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            entityType: 'intangible_batch',
            entityId: created.id,
            action: 'upload',
            metadata: {
              fileName,
              cutDate,
              rowCount: parsed.rows.length,
              discarded: parsed.discarded,
            },
          },
        });
        return created;
      },
      { timeout: 120_000 },
    );

    return {
      id: batch.id,
      cutDate,
      fileName,
      rowCount: parsed.rows.length,
      discarded: parsed.discarded,
      warningCount: parsed.warnings.length,
      warnings: parsed.warnings.slice(0, 200),
    };
  }

  async makeCurrent(tenantId: string, actorUserId: string, batchId: string) {
    const batch = await this.prisma.intangibleBatch.findFirst({
      where: { id: batchId, tenantId },
    });
    if (!batch) throw new NotFoundException('Versión no encontrada');
    await this.prisma.$transaction([
      this.prisma.intangibleBatch.updateMany({
        where: { tenantId, source: batch.source, isCurrent: true },
        data: { isCurrent: false },
      }),
      this.prisma.intangibleBatch.update({
        where: { id: batch.id },
        data: { isCurrent: true },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'intangible_batch',
          entityId: batch.id,
          action: 'make_current',
          metadata: {
            source: batch.source,
            cutDate: batch.cutDate.toISOString().slice(0, 10),
          },
        },
      }),
    ]);
    return { ok: true };
  }

  async list(tenantId: string, f: IntangibleListFilters) {
    const where: Prisma.Sql[] = [];
    if (f.search?.trim()) {
      const q = `%${f.search.trim()}%`;
      where.push(Prisma.sql`(x.code ILIKE ${q} OR x.description ILIKE ${q} OR x.inventory_code ILIKE ${q}
        OR x.siga_supplier ILIKE ${q} OR x.excel_supplier ILIKE ${q} OR x.po_number::text = ${f.search.trim()})`);
    }
    if (f.status === 'active') where.push(Prisma.sql`x.status = 'active'`);
    if (f.status === 'retired') where.push(Prisma.sql`x.status = 'retired'`);
    if (f.status === 'excel_only') where.push(Prisma.sql`NOT x.in_siga`);
    if (f.condition === 'definida')
      where.push(Prisma.sql`x.condition = 'VIDA ÚTIL DEFINIDA'`);
    if (f.condition === 'indefinida')
      where.push(Prisma.sql`x.condition = 'VIDA ÚTIL INDEFINIDA'`);
    if (f.condition === 'none')
      where.push(Prisma.sql`x.in_excel AND x.condition IS NULL`);
    if (f.expiry) where.push(Prisma.sql`x.expiry_bucket = ${f.expiry}`);
    if (f.suspicious) where.push(Prisma.sql`x.suspicious_account`);

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      ${currentRecordsCte(tenantId)}
      SELECT x.*, count(*) OVER ()::int AS total FROM (
        SELECT COALESCE(s.patrimonial_code, c.patrimonial_code) AS code,
               COALESCE(s.inventory_code, c.inventory_code) AS inventory_code,
               COALESCE(s.description, c.description) AS description,
               COALESCE(s.brand, c.brand) AS brand,
               s.status::text AS status,
               COALESCE(s.po_number, c.po_number) AS po_number,
               COALESCE(s.po_year, c.po_year) AS po_year,
               s.supplier_name AS siga_supplier,
               c.supplier_name AS excel_supplier,
               to_char(COALESCE(s.registered_at, c.registered_at), 'YYYY-MM-DD') AS registered_at,
               COALESCE(s.initial_value, c.initial_value)::float8 AS initial_value,
               COALESCE(s.org_unit, c.org_unit) AS org_unit,
               c.condition_norm AS condition,
               to_char(c.expires_at, 'YYYY-MM-DD') AS expires_at,
               c.justification, c.hr, c.document, c.account_name,
               (s.id IS NOT NULL) AS in_siga,
               (c.id IS NOT NULL) AS in_excel,
               ${suspiciousAccountSql} AS suspicious_account,
               ${expiryBucketSql} AS expiry_bucket
          FROM s FULL JOIN c ON c.patrimonial_code = s.patrimonial_code
      ) x
      ${where.length ? Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}` : Prisma.empty}
      ORDER BY x.code
      LIMIT ${f.take} OFFSET ${f.skip}`;

    return {
      ...paged(rows),
      expiringDays: EXPIRING_DAYS,
      cuts: await this.currentCuts(tenantId),
    };
  }

  async detail(tenantId: string, code: string) {
    const records = await this.prisma.intangibleRecord.findMany({
      where: { patrimonialCode: code, batch: { tenantId, isCurrent: true } },
      include: {
        batch: { select: { source: true, cutDate: true, fileName: true } },
      },
    });
    if (!records.length)
      throw new NotFoundException('Bien intangible no encontrado');
    const pick = (source: IntangibleSource) => {
      const r = records.find((x) => x.batch.source === source);
      if (!r) return null;
      const { raw, ...rest } = r;
      return {
        ...rest,
        raw: source === IntangibleSource.coordinator ? raw : undefined,
      };
    };
    return {
      code,
      siga: pick(IntangibleSource.siga),
      coordinator: pick(IntangibleSource.coordinator),
    };
  }

  async currentCuts(tenantId: string) {
    const batches = await this.prisma.intangibleBatch.findMany({
      where: { tenantId, isCurrent: true },
      select: {
        id: true,
        source: true,
        cutDate: true,
        fileName: true,
        rowCount: true,
      },
    });
    const one = (source: IntangibleSource) => {
      const b = batches.find((x) => x.source === source);
      return b ? { ...b, cutDate: b.cutDate.toISOString().slice(0, 10) } : null;
    };
    const siga = one(IntangibleSource.siga);
    const coordinator = one(IntangibleSource.coordinator);
    return {
      siga,
      coordinator,
      // Si el Excel es más nuevo que SIGA, "solo en Excel" puede incluir bienes que SIGA aún no refleja.
      excelNewerThanSiga:
        !!siga && !!coordinator && coordinator.cutDate > siga.cutDate,
    };
  }
}
