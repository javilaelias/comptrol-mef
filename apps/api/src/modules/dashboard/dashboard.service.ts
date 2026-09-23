import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(tenantId: string) {
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60 * 1000);
    const stale30dCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      totalAssets,
      ewasteCandidates,
      licenseAgg,
      intangibleLicenseAgg,
      inventoryAgg,
      reporting24h,
      staleAssets30d,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.asset.count({
        where: {
          tenantId,
          status: { in: ['in_stock', 'retired', 'disposed'] },
        },
      }),
      // Las licencias retiradas (p. ej. grupos de intangibles dados de baja) no suman.
      this.prisma.softwareLicense.aggregate({
        where: { tenantId, status: { not: 'retired' } },
        _sum: { totalSeats: true },
      }),
      this.prisma.softwareLicense.aggregate({
        where: { tenantId, status: { not: 'retired' }, origin: 'intangibles' },
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
    const intangibleLicenseSeats = Number(
      intangibleLicenseAgg._sum.totalSeats ?? 0,
    );
    const inventoryValue = Number(inventoryAgg._sum.currentBookValue ?? 0);

    return {
      totalAssets,
      inactiveLicenses,
      intangibleLicenseSeats,
      ewasteCandidates,
      inventoryValue,
      reporting24h,
      staleAssets30d,
    };
  }
}
