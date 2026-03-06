import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LicenseHoldingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    {
      search,
      executingUnit,
      category,
      take,
      skip,
    }: { search?: string; executingUnit?: string; category?: string; take: number; skip: number },
  ) {
    const q = search?.trim();

    const where: Prisma.LicenseHoldingWhereInput = {
      tenantId,
      ...(executingUnit ? { executingUnit: { contains: executingUnit.trim(), mode: 'insensitive' } } : {}),
      ...(category ? { category: { contains: category.trim(), mode: 'insensitive' } } : {}),
      ...(q ? { softwareName: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.licenseHolding.findMany({ where, take, skip, orderBy: [{ softwareName: 'asc' }, { executingUnit: 'asc' }] }),
      this.prisma.licenseHolding.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async summaryBySoftware(tenantId: string) {
    const rows = await this.prisma.licenseHolding.groupBy({
      by: ['softwareName'],
      where: { tenantId },
      _sum: { quantityInt: true },
      _count: { _all: true },
      orderBy: { _sum: { quantityInt: 'desc' } },
    });

    return rows.map((r) => ({
      softwareName: r.softwareName,
      totalQuantity: r._sum.quantityInt ?? 0,
      rows: r._count._all,
    }));
  }

  async summaryByExecutingUnit(tenantId: string) {
    const rows = await this.prisma.licenseHolding.groupBy({
      by: ['executingUnit'],
      where: { tenantId },
      _sum: { quantityInt: true },
      _count: { _all: true },
      orderBy: { _sum: { quantityInt: 'desc' } },
    });

    return rows.map((r) => ({
      executingUnit: r.executingUnit ?? 'Sin unidad',
      totalQuantity: r._sum.quantityInt ?? 0,
      rows: r._count._all,
    }));
  }
}

