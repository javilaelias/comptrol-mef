import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async staleAssets(tenantId: string, days: number, limit: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.prisma.asset.findMany({
      where: {
        tenantId,
        status: 'in_use',
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: cutoff } }],
      },
      take: limit,
      orderBy: [{ lastSeenAt: 'asc' }, { updatedAt: 'desc' }],
      include: { location: { include: { site: true } } },
    });
  }

  async ewasteTrend(tenantId: string, months: number) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        month: Date;
        count: number;
      }>
    >(Prisma.sql`
      SELECT
        date_trunc('month', a.updated_at) AS month,
        COUNT(*)::int AS count
      FROM assets a
      WHERE
        a.tenant_id = ${tenantId}::uuid
        AND a.status IN ('retired', 'disposed')
        AND a.updated_at >= (now() - make_interval(months => ${months}))
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      count: Number(r.count),
    }));
  }

  async inventoryValueBySite(tenantId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        site_id: string | null;
        site_name: string;
        asset_count: number;
        inventory_value: string;
      }>
    >(Prisma.sql`
      SELECT
        s.id AS site_id,
        COALESCE(s.name, 'Sin sede') AS site_name,
        COUNT(a.id)::int AS asset_count,
        COALESCE(SUM(a.current_book_value), 0)::text AS inventory_value
      FROM assets a
      LEFT JOIN locations l ON l.id = a.location_id
      LEFT JOIN sites s ON s.id = l.site_id
      WHERE a.tenant_id = ${tenantId}::uuid
      GROUP BY s.id, s.name
      ORDER BY COALESCE(SUM(a.current_book_value), 0) DESC
    `);

    return rows.map((r) => ({
      siteId: r.site_id,
      siteName: r.site_name,
      assetCount: Number(r.asset_count),
      inventoryValue: Number(r.inventory_value),
    }));
  }
}
