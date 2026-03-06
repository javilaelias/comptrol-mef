import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(tenantId: string) {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const stale30dCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [totalAssets, ewasteCandidates, licenseAgg, inventoryAgg, reporting24h, staleAssets30d] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.asset.count({ where: { tenantId, status: { in: ['in_stock', 'retired', 'disposed'] } } }),
      this.prisma.softwareLicense.aggregate({
        where: { tenantId },
        _sum: { totalSeats: true },
      }),
      this.prisma.asset.aggregate({
        where: { tenantId },
        _sum: { currentBookValue: true },
      }),
      this.prisma.asset.count({
        where: { tenantId, status: 'in_use', lastSeenAt: { gte: since24h } },
      }),
      this.prisma.asset.count({
        where: {
          tenantId,
          status: 'in_use',
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: stale30dCutoff } }],
        },
      }),
    ]);

    const inactiveLicenses = Number(licenseAgg._sum.totalSeats ?? 0);
    const inventoryValue = Number(inventoryAgg._sum.currentBookValue ?? 0);

    return {
      totalAssets,
      inactiveLicenses,
      ewasteCandidates,
      inventoryValue,
      reporting24h,
      staleAssets30d,
    };
  }
}
