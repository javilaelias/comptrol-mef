import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const [sites, counts] = await Promise.all([
      this.prisma.site.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, city: true, latitude: true, longitude: true },
      }),
      this.prisma.$queryRaw<Array<{ site_id: string; asset_count: number }>>(Prisma.sql`
        SELECT
          s.id AS site_id,
          COUNT(a.id)::int AS asset_count
        FROM sites s
        LEFT JOIN locations l ON l.site_id = s.id
        LEFT JOIN assets a ON a.location_id = l.id
        WHERE s.tenant_id = ${tenantId}::uuid
        GROUP BY s.id
      `),
    ]);

    const countBySite = new Map(counts.map((c) => [c.site_id, Number(c.asset_count)]));

    return sites.map((s) => ({
      ...s,
      latitude: s.latitude !== null ? Number(s.latitude) : null,
      longitude: s.longitude !== null ? Number(s.longitude) : null,
      assetCount: countBySite.get(s.id) ?? 0,
    }));
  }

  async updateGeo(
    tenantId: string,
    actorUserId: string,
    siteId: string,
    geo: { latitude?: number | null; longitude?: number | null },
  ) {
    const before = await this.prisma.site.findFirst({ where: { tenantId, id: siteId } });
    if (!before) return null;

    const site = await this.prisma.site.update({
      where: { id: siteId },
      data: {
        latitude:
          geo.latitude === undefined ? undefined : geo.latitude === null ? null : new Prisma.Decimal(String(geo.latitude)),
        longitude:
          geo.longitude === undefined
            ? undefined
            : geo.longitude === null
              ? null
              : new Prisma.Decimal(String(geo.longitude)),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        entityType: 'sites',
        entityId: site.id,
        action: 'update_geo',
        beforeData: before as any,
        afterData: site as any,
        metadata: { source: 'ui' },
      },
    });

    return {
      id: site.id,
      name: site.name,
      latitude: site.latitude !== null ? Number(site.latitude) : null,
      longitude: site.longitude !== null ? Number(site.longitude) : null,
    };
  }
}

