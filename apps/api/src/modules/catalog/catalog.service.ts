import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async sites(tenantId: string) {
    return this.prisma.site.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, city: true },
    });
  }

  async locations(tenantId: string, siteId?: string) {
    return this.prisma.location.findMany({
      where: { tenantId, isActive: true, ...(siteId ? { siteId } : {}) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, siteId: true },
      take: 5000,
    });
  }

  async orgUnits(tenantId: string) {
    return this.prisma.orgUnit.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
      take: 5000,
    });
  }
}

