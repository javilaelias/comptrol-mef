import { Injectable } from '@nestjs/common';
import { AssetSource, AssetType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentHeartbeatDto } from './dto/agent-heartbeat.dto';
import type { AgentInventoryDto } from './dto/agent-inventory.dto';

function normalizeMac(value?: string) {
  return value?.trim().toLowerCase() || null;
}

function cleanStr(value?: string | null) {
  const v = value?.trim();
  return v ? v : null;
}

function autoAssetTag(serialNumber?: string | null, hostname?: string | null) {
  const base = (serialNumber || hostname || 'UNKNOWN')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const tag = `AUTO-${base || 'UNKNOWN'}-${suffix}`;
  return tag.slice(0, 80);
}

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  private async getMefTenantId() {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug: 'mef' },
      select: { id: true },
    });
    if (!tenant) throw new Error('Tenant mef not found');
    return tenant.id;
  }

  private async findAsset(
    tenantId: string,
    input: {
      assetTag?: string | null;
      serialNumber?: string | null;
      macAddress?: string | null;
    },
  ) {
    const assetTag = cleanStr(input.assetTag);
    const serialNumber = cleanStr(input.serialNumber);
    const macAddress = normalizeMac(input.macAddress ?? undefined);

    if (assetTag) {
      const byTag = await this.prisma.asset.findFirst({
        where: { tenantId, assetTag },
      });
      if (byTag) return byTag;
    }
    if (serialNumber) {
      const bySerial = await this.prisma.asset.findFirst({
        where: { tenantId, serialNumber },
      });
      if (bySerial) return bySerial;
    }
    if (macAddress) {
      const byMac = await this.prisma.asset.findFirst({
        where: { tenantId, macAddress },
      });
      if (byMac) return byMac;
    }

    return null;
  }

  async heartbeat(dto: AgentHeartbeatDto) {
    const tenantId = await this.getMefTenantId();
    const now = new Date();

    const asset = await this.upsertAssetCore(tenantId, {
      assetTag: dto.assetTag,
      serialNumber: dto.serialNumber,
      macAddress: dto.macAddress,
      hostname: dto.hostname,
      ipAddress: dto.ipAddress,
      operatingSystem: dto.operatingSystem,
      vendor: dto.vendor,
      model: dto.model,
      now,
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        entityType: 'assets',
        entityId: asset.id,
        action: 'agent_heartbeat',
        afterData: {
          id: asset.id,
          assetTag: asset.assetTag,
          hostname: asset.hostname,
          ipAddress: asset.ipAddress,
          macAddress: asset.macAddress,
          serialNumber: asset.serialNumber,
          operatingSystem: asset.operatingSystem,
          lastSeenAt: asset.lastSeenAt,
          source: asset.source,
        } as any,
        metadata: { channel: 'agent', receivedAt: now.toISOString() },
      },
    });

    return { ok: true, assetId: asset.id, lastSeenAt: asset.lastSeenAt };
  }

  async inventory(dto: AgentInventoryDto) {
    const tenantId = await this.getMefTenantId();
    const now = new Date();
    const collectedAt = dto.collectedAt ? new Date(dto.collectedAt) : now;

    const asset = await this.upsertAssetCore(tenantId, {
      assetTag: dto.assetTag,
      serialNumber: dto.serialNumber,
      macAddress: dto.macAddress,
      hostname: dto.hostname,
      ipAddress: dto.ipAddress,
      operatingSystem: dto.operatingSystem,
      osVersion: dto.osVersion,
      vendor: dto.vendor,
      model: dto.model,
      assetType: dto.assetType,
      cpuModel: dto.cpuModel,
      cpuCores: dto.cpuCores,
      cpuLogical: dto.cpuLogical,
      ramMb: dto.ramMb,
      storageGb: dto.storageGb,
      now,
      collectedAt,
    });

    const sw = (dto.software ?? [])
      .map((s) => ({
        name: s.name?.trim(),
        version: cleanStr(s.version),
        publisher: cleanStr(s.publisher),
      }))
      .filter((s) => !!s.name) as Array<{
      name: string;
      version: string | null;
      publisher: string | null;
    }>;

    await this.prisma.$transaction(async (tx) => {
      await tx.softwareInstallation.deleteMany({
        where: { tenantId, assetId: asset.id },
      });
      if (sw.length) {
        await tx.softwareInstallation.createMany({
          data: sw.map((s) => ({
            tenantId,
            assetId: asset.id,
            name: s.name,
            version: s.version,
            publisher: s.publisher,
            detectedAt: collectedAt,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: null,
          entityType: 'assets',
          entityId: asset.id,
          action: 'agent_inventory',
          afterData: {
            id: asset.id,
            assetTag: asset.assetTag,
            serialNumber: asset.serialNumber,
            hostname: asset.hostname,
            operatingSystem: asset.operatingSystem,
            osVersion: (asset as any).osVersion,
            cpuModel: (asset as any).cpuModel,
            cpuCores: (asset as any).cpuCores,
            cpuLogical: (asset as any).cpuLogical,
            ramMb: (asset as any).ramMb,
            storageGb: (asset as any).storageGb,
            lastInventoryAt: (asset as any).lastInventoryAt,
            softwareCount: sw.length,
          } as any,
          metadata: {
            channel: 'agent',
            receivedAt: now.toISOString(),
            collectedAt: collectedAt.toISOString(),
          },
        },
      });
    });

    return {
      ok: true,
      assetId: asset.id,
      lastInventoryAt: collectedAt,
      softwareCount: sw.length,
    };
  }

  private async upsertAssetCore(
    tenantId: string,
    input: {
      assetTag?: string;
      serialNumber?: string;
      macAddress?: string;
      hostname?: string;
      ipAddress?: string;
      operatingSystem?: string;
      osVersion?: string;
      vendor?: string;
      model?: string;
      assetType?: AssetType;
      cpuModel?: string;
      cpuCores?: number;
      cpuLogical?: number;
      ramMb?: number;
      storageGb?: number;
      now: Date;
      collectedAt?: Date;
    },
  ) {
    const serialNumber = cleanStr(input.serialNumber);
    const hostname = cleanStr(input.hostname);
    const macAddress = normalizeMac(input.macAddress);
    const explicitAssetTag = cleanStr(input.assetTag);

    if (!explicitAssetTag && !serialNumber && !macAddress && !hostname) {
      throw new Error(
        'At least one identifier is required (assetTag, serialNumber, macAddress, or hostname)',
      );
    }

    const existing = await this.findAsset(tenantId, input);
    const assetTag =
      explicitAssetTag ??
      existing?.assetTag ??
      autoAssetTag(serialNumber, hostname);

    if (!assetTag) throw new Error('assetTag is required (explicit or auto)');

    const data = {
      hostname: hostname ?? undefined,
      ipAddress: cleanStr(input.ipAddress) ?? undefined,
      macAddress: normalizeMac(input.macAddress) ?? undefined,
      serialNumber: serialNumber ?? undefined,
      operatingSystem: cleanStr(input.operatingSystem) ?? undefined,
      osVersion: cleanStr(input.osVersion) ?? undefined,
      vendor: cleanStr(input.vendor) ?? undefined,
      model: cleanStr(input.model) ?? undefined,
      cpuModel: cleanStr(input.cpuModel) ?? undefined,
      cpuCores: typeof input.cpuCores === 'number' ? input.cpuCores : undefined,
      cpuLogical:
        typeof input.cpuLogical === 'number' ? input.cpuLogical : undefined,
      ramMb: typeof input.ramMb === 'number' ? input.ramMb : undefined,
      storageGb:
        typeof input.storageGb === 'number' ? input.storageGb : undefined,
      assetType: input.assetType ?? undefined,
      status: 'in_use' as const,
      lastSeenAt: input.now,
      lastInventoryAt: input.collectedAt,
      source: AssetSource.discovery_passive,
    };

    if (existing) {
      return this.prisma.asset.update({
        where: { id: existing.id },
        data: {
          ...data,
          fingerprint: existing.fingerprint ?? serialNumber ?? assetTag,
        } as any,
      });
    }

    return this.prisma.asset.create({
      data: {
        tenantId,
        assetTag,
        serialNumber: serialNumber ?? null,
        hostname: hostname ?? null,
        ipAddress: cleanStr(input.ipAddress) ?? null,
        macAddress: normalizeMac(input.macAddress) ?? null,
        operatingSystem: cleanStr(input.operatingSystem) ?? null,
        osVersion: cleanStr(input.osVersion) ?? null,
        vendor: cleanStr(input.vendor) ?? null,
        model: cleanStr(input.model) ?? null,
        cpuModel: cleanStr(input.cpuModel) ?? null,
        cpuCores: typeof input.cpuCores === 'number' ? input.cpuCores : null,
        cpuLogical:
          typeof input.cpuLogical === 'number' ? input.cpuLogical : null,
        ramMb: typeof input.ramMb === 'number' ? input.ramMb : null,
        storageGb: typeof input.storageGb === 'number' ? input.storageGb : null,
        assetType: input.assetType ?? AssetType.desktop,
        status: 'in_use',
        criticality: 'medium',
        purchaseCost: 0,
        currentBookValue: 0,
        lastSeenAt: input.now,
        lastInventoryAt: input.collectedAt ?? null,
        source: AssetSource.discovery_passive,
        fingerprint: serialNumber ?? assetTag,
      } as any,
    });
  }
}
