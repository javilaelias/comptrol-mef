import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(tenantId: string) {
    const [totalAssets, ewasteCandidates, licenseAgg, inventoryAgg] = await Promise.all([
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
    ]);

    const inactiveLicenses = Number(licenseAgg._sum.totalSeats ?? 0);
    const inventoryValue = Number(inventoryAgg._sum.currentBookValue ?? 0);

    return {
      totalAssets,
      inactiveLicenses,
      ewasteCandidates,
      inventoryValue,
    };
  }
}
