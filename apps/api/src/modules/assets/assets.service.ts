import { Injectable } from '@nestjs/common';
import { AssetSource, AssetType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscoveryIngestDto, DiscoverySource } from './dto/discovery-ingest.dto';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

function normalizeMac(value?: string) {
  return value?.trim().toLowerCase() || undefined;
}

function toAssetType(value: string): AssetType {
  const v = value.trim().toLowerCase();
  const allowed = new Set<string>([
    'laptop',
    'desktop',
    'server',
    'network',
    'iot',
    'ot',
    'mobile',
    'virtual_machine',
    'cloud_resource',
    'other',
  ]);
  return (allowed.has(v) ? v : 'other') as AssetType;
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    {
      search,
      status,
      siteId,
      orgUnitId,
      take,
      skip,
    }: {
      search?: string;
      status?: string;
      siteId?: string;
      orgUnitId?: string;
      take: number;
      skip: number;
    },
  ) {
    const q = search?.trim();

    const where: Prisma.AssetWhereInput = {
      tenantId,
      ...(status ? { status: status as any } : {}),
      ...(orgUnitId ? { orgUnitId } : {}),
      ...(siteId ? { location: { siteId } } : {}),
      ...(q
        ? {
            OR: [
              { assetTag: { contains: q, mode: 'insensitive' } },
              { inventoryCode: { contains: q, mode: 'insensitive' } },
              { serialNumber: { contains: q, mode: 'insensitive' } },
              { hostname: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        take,
        skip,
        orderBy: { updatedAt: 'desc' },
        include: { location: { include: { site: true } }, orgUnit: true },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async getById(tenantId: string, id: string) {
    return this.prisma.asset.findFirst({
      where: { tenantId, id },
      include: { location: { include: { site: true } }, orgUnit: true, owner: true },
    });
  }

  async getByAssetTag(tenantId: string, assetTag: string) {
    return this.prisma.asset.findFirst({
      where: { tenantId, assetTag },
      include: { location: { include: { site: true } }, owner: true },
    });
  }

  async create(tenantId: string, actorUserId: string, dto: CreateAssetDto) {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          tenantId,
          assetTag: dto.assetTag.trim(),
          inventoryCode: dto.inventoryCode?.trim() ?? null,
          description: dto.description ?? null,
          serialNumber: dto.serialNumber?.trim() ?? null,
          hostname: dto.hostname?.trim() ?? null,
          ipAddress: dto.ipAddress?.trim() ?? null,
          macAddress: normalizeMac(dto.macAddress) ?? null,
          assetType: dto.assetType,
          vendor: dto.vendor?.trim() ?? null,
          model: dto.model?.trim() ?? null,
          operatingSystem: dto.operatingSystem?.trim() ?? null,
          status: dto.status ?? 'in_use',
          criticality: dto.criticality ?? 'medium',
          conditionLabel: dto.conditionLabel?.trim() ?? null,
          acquisitionYear: dto.acquisitionYear ?? null,
          locationId: dto.locationId ?? null,
          orgUnitId: dto.orgUnitId ?? null,
          purchaseCost: dto.purchaseCost ?? 0,
          currentBookValue: dto.currentBookValue ?? 0,
          source: AssetSource.manual,
          fingerprint: dto.serialNumber?.trim() ?? dto.assetTag.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'assets',
          entityId: asset.id,
          action: 'create',
          afterData: asset as any,
          metadata: { source: 'crud' },
        },
      });

      return asset;
    });
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateAssetDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.asset.findFirst({ where: { tenantId, id } });
      if (!before) return null;

      const asset = await tx.asset.update({
        where: { id },
        data: {
          assetTag: dto.assetTag?.trim(),
          inventoryCode: dto.inventoryCode?.trim(),
          description: dto.description,
          serialNumber: dto.serialNumber?.trim(),
          hostname: dto.hostname?.trim(),
          ipAddress: dto.ipAddress?.trim(),
          macAddress: dto.macAddress ? normalizeMac(dto.macAddress) : undefined,
          assetType: dto.assetType,
          vendor: dto.vendor?.trim(),
          model: dto.model?.trim(),
          operatingSystem: dto.operatingSystem?.trim(),
          status: dto.status,
          criticality: dto.criticality,
          conditionLabel: dto.conditionLabel?.trim(),
          acquisitionYear: dto.acquisitionYear,
          locationId: dto.locationId,
          orgUnitId: dto.orgUnitId,
          purchaseCost: dto.purchaseCost,
          currentBookValue: dto.currentBookValue,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'assets',
          entityId: asset.id,
          action: 'update',
          beforeData: before as any,
          afterData: asset as any,
          metadata: { source: 'crud' },
        },
      });

      return asset;
    });
  }

  async retire(tenantId: string, actorUserId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.asset.findFirst({ where: { tenantId, id } });
      if (!before) return null;

      const asset = await tx.asset.update({
        where: { id },
        data: { status: 'retired' },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'assets',
          entityId: asset.id,
          action: 'retire',
          beforeData: before as any,
          afterData: asset as any,
          metadata: { source: 'crud' },
        },
      });

      return asset;
    });
  }

  async ingestDiscovery(tenantId: string, actorUserId: string | null, dto: DiscoveryIngestDto) {
    const serial = dto.serialNumber?.trim() || undefined;
    const mac = normalizeMac(dto.macAddress);
    const host = dto.hostname?.trim() || undefined;
    const ip = dto.ipAddress?.trim() || undefined;
    const fingerprint = serial || mac || `${host ?? 'unknown'}|${ip ?? 'unknown'}`;

    const now = new Date();
    const source = dto.source === DiscoverySource.discovery_passive ? AssetSource.discovery_passive : AssetSource.discovery_active;

    const existing =
      (serial
        ? await this.prisma.asset.findFirst({ where: { tenantId, serialNumber: serial } })
        : null) ??
      (mac ? await this.prisma.asset.findFirst({ where: { tenantId, macAddress: mac } }) : null) ??
      (host && ip ? await this.prisma.asset.findFirst({ where: { tenantId, hostname: host, ipAddress: ip } }) : null);

    const beforeData = existing ? { id: existing.id, serialNumber: existing.serialNumber, macAddress: existing.macAddress } : null;

    const asset =
      existing
        ? await this.prisma.asset.update({
            where: { id: existing.id },
            data: {
              hostname: host ?? existing.hostname,
              ipAddress: ip ?? existing.ipAddress,
              macAddress: mac ?? existing.macAddress,
              serialNumber: serial ?? existing.serialNumber,
              vendor: dto.vendor?.trim() ?? existing.vendor,
              model: dto.model?.trim() ?? existing.model,
              assetType: toAssetType(dto.assetType),
              source,
              lastSeenAt: now,
              fingerprint,
            },
          })
        : await this.prisma.asset.create({
            data: {
              tenantId,
              assetTag: `AUTO-${now.getTime()}`,
              hostname: host ?? null,
              ipAddress: ip ?? null,
              macAddress: mac ?? null,
              serialNumber: serial ?? null,
              assetType: toAssetType(dto.assetType),
              vendor: dto.vendor?.trim() ?? null,
              model: dto.model?.trim() ?? null,
              status: 'in_use',
              criticality: 'medium',
              purchaseCost: 0,
              currentBookValue: 0,
              lastSeenAt: now,
              source,
              fingerprint,
            },
          });

    const audit = await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        entityType: 'assets',
        entityId: asset.id,
        action: 'discover',
        beforeData: beforeData ?? undefined,
        afterData: {
          id: asset.id,
          assetTag: asset.assetTag,
          serialNumber: asset.serialNumber,
          macAddress: asset.macAddress,
          ipAddress: asset.ipAddress,
          hostname: asset.hostname,
          source: asset.source,
          lastSeenAt: asset.lastSeenAt,
        },
        metadata: { fingerprint },
      },
    });

    return { asset, audit };
  }
}
