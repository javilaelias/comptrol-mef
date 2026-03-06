import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, { search, take, skip }: { search?: string; take: number; skip: number }) {
    const q = search?.trim();
    const where: Prisma.ApplicationWhereInput = {
      tenantId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { ownerOrgUnit: { contains: q, mode: 'insensitive' } },
              { status: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.application.findMany({ where, take, skip, orderBy: { updatedAt: 'desc' } }),
      this.prisma.application.count({ where }),
    ]);
    return { items, total, take, skip };
  }

  async get(tenantId: string, id: string) {
    return this.prisma.application.findFirst({ where: { tenantId, id } });
  }

  async create(tenantId: string, actorUserId: string, dto: CreateApplicationDto) {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          objective: dto.objective ?? null,
          ownerOrgUnit: dto.ownerOrgUnit?.trim() ?? null,
          status: dto.status?.trim() ?? null,
          lastUpdateYear: dto.lastUpdateYear ?? null,
          sourceDocument: 'manual',
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'applications',
          entityId: app.id,
          action: 'create',
          afterData: app as any,
          metadata: { source: 'crud' },
        },
      });
      return app;
    });
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateApplicationDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.application.findFirst({ where: { tenantId, id } });
      if (!before) return null;

      const app = await tx.application.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          objective: dto.objective,
          ownerOrgUnit: dto.ownerOrgUnit?.trim(),
          status: dto.status?.trim(),
          lastUpdateYear: dto.lastUpdateYear,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'applications',
          entityId: app.id,
          action: 'update',
          beforeData: before as any,
          afterData: app as any,
          metadata: { source: 'crud' },
        },
      });
      return app;
    });
  }

  async remove(tenantId: string, actorUserId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.application.findFirst({ where: { tenantId, id } });
      if (!before) return null;

      await tx.application.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'applications',
          entityId: id,
          action: 'delete',
          beforeData: before as any,
          metadata: { source: 'crud' },
        },
      });

      return { success: true };
    });
  }
}
