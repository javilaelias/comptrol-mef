import { Injectable } from '@nestjs/common';
import { AssetSource, AssetType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentHeartbeatDto } from './dto/agent-heartbeat.dto';

function normalizeMac(value?: string) {
  return value?.trim().toLowerCase() || null;
}

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(dto: AgentHeartbeatDto) {
    const tenant = await this.prisma.tenant.findFirst({ where: { slug: 'mef' }, select: { id: true } });
    if (!tenant) throw new Error('Tenant mef not found');

    const now = new Date();
    const assetTag = dto.assetTag.trim();

    const existing = await this.prisma.asset.findFirst({
      where: { tenantId: tenant.id, assetTag },
    });

    const asset =
      existing
        ? await this.prisma.asset.update({
            where: { id: existing.id },
            data: {
              hostname: dto.hostname?.trim() ?? existing.hostname,
              ipAddress: dto.ipAddress?.trim() ?? existing.ipAddress,
              macAddress: normalizeMac(dto.macAddress) ?? existing.macAddress,
              serialNumber: dto.serialNumber?.trim() ?? existing.serialNumber,
              operatingSystem: dto.operatingSystem?.trim() ?? existing.operatingSystem,
              vendor: dto.vendor?.trim() ?? existing.vendor,
              model: dto.model?.trim() ?? existing.model,
              status: 'in_use',
              lastSeenAt: now,
              source: AssetSource.discovery_passive,
              fingerprint: existing.fingerprint ?? dto.serialNumber?.trim() ?? assetTag,
            },
          })
        : await this.prisma.asset.create({
            data: {
              tenantId: tenant.id,
              assetTag,
              hostname: dto.hostname?.trim() ?? null,
              ipAddress: dto.ipAddress?.trim() ?? null,
              macAddress: normalizeMac(dto.macAddress),
              serialNumber: dto.serialNumber?.trim() ?? null,
              operatingSystem: dto.operatingSystem?.trim() ?? null,
              vendor: dto.vendor?.trim() ?? null,
              model: dto.model?.trim() ?? null,
              assetType: AssetType.other,
              status: 'in_use',
              criticality: 'medium',
              purchaseCost: 0,
              currentBookValue: 0,
              lastSeenAt: now,
              source: AssetSource.discovery_passive,
              fingerprint: dto.serialNumber?.trim() ?? assetTag,
            },
          });

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
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
}

