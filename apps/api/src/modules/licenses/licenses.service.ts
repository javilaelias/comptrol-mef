import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LicenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LICENSE_ORIGIN_INTANGIBLES,
  licenseGroupKey,
  loadIntangibleGroups,
  regenerateLicensesFromIntangibles,
  type RegenerateResult,
} from './licenses-from-intangibles';

export type LicenseListFilters = {
  search?: string;
  status?: LicenseStatus;
  origin?: string;
  take: number;
  skip: number;
};

@Injectable()
export class LicensesService {
  private readonly logger = new Logger(LicensesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, f: LicenseListFilters) {
    const where: Prisma.SoftwareLicenseWhereInput = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.origin ? { origin: f.origin } : {}),
      ...(f.search?.trim()
        ? {
            OR: [
              {
                softwareName: {
                  contains: f.search.trim(),
                  mode: 'insensitive',
                },
              },
              { vendor: { contains: f.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items, byStatus] = await Promise.all([
      this.prisma.softwareLicense.count({ where }),
      this.prisma.softwareLicense.findMany({
        where,
        orderBy: [
          { renewalDate: { sort: 'asc', nulls: 'last' } },
          { softwareName: 'asc' },
        ],
        take: f.take,
        skip: f.skip,
      }),
      this.prisma.softwareLicense.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
        _sum: { totalSeats: true },
      }),
    ]);
    return {
      total,
      items,
      byStatus: byStatus.map((s) => ({
        status: s.status,
        licenses: s._count._all,
        seats: s._sum.totalSeats ?? 0,
      })),
    };
  }

  /** Bienes intangibles (versiones vigentes) que forman una licencia generada desde intangibles. */
  async members(tenantId: string, id: string) {
    const license = await this.prisma.softwareLicense.findFirst({
      where: { id, tenantId },
    });
    if (!license) throw new NotFoundException('Licencia no encontrada');
    if (license.origin !== LICENSE_ORIGIN_INTANGIBLES || !license.originKey)
      return { license, items: [] };
    const groups = await loadIntangibleGroups(this.prisma, tenantId);
    const items = (groups.get(licenseGroupKey(license.originKey) ?? '') ?? [])
      .map((m) => ({
        code: m.code,
        description: m.description,
        active: m.active,
        condition: m.condition,
        expiresAt: m.expiresAt,
        poNumber: m.poNumber,
        poYear: m.poYear,
        initialValue: m.value,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return { license, items };
  }

  async regenerate(
    tenantId: string,
    actorUserId: string | null,
    reason: string,
  ): Promise<RegenerateResult> {
    const result = await regenerateLicensesFromIntangibles(
      this.prisma,
      tenantId,
    );
    this.logger.log(
      `Licencias desde intangibles (${reason}): ${JSON.stringify(result)}`,
    );
    if (actorUserId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'software_licenses',
          entityId: tenantId,
          action: 'regenerate_from_intangibles',
          metadata: { reason, ...result },
        },
      });
    }
    return result;
  }

  /**
   * Regenera sin hacer fallar la operación que la dispara (subida del Excel, cambio de versión):
   * si falla, se registra y se informa en la respuesta, y se puede reintentar con POST /licenses/regenerate.
   */
  async regenerateSafely(
    tenantId: string,
    actorUserId: string,
    reason: string,
  ) {
    try {
      return {
        ok: true as const,
        ...(await this.regenerate(tenantId, actorUserId, reason)),
      };
    } catch (err) {
      this.logger.error(
        `No se pudieron regenerar las licencias (${reason})`,
        err instanceof Error ? err.stack : err,
      );
      return { ok: false as const };
    }
  }
}
