import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateAlertRulesDto } from './dto/update-alert-rules.dto';
import { DEFAULT_DAYS_BEFORE, generateExpiryAlerts } from './expiry-alerts';

export const ALERT_ADMIN_ROLES = ['super_admin', 'it_admin'];

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Revisión diaria de vencimientos, a las 07:00 de Lima, para todos los tenants. */
  @Cron('0 7 * * *', { name: 'expiry-alerts', timeZone: 'America/Lima' })
  async runDaily() {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, slug: true },
    });
    for (const t of tenants) {
      try {
        const r = await generateExpiryAlerts(this.prisma, t.id);
        this.logger.log(
          `Alertas de vencimiento (${t.slug}): ${JSON.stringify(r)}`,
        );
      } catch (err) {
        this.logger.error(
          `Falló la revisión de alertas (${t.slug})`,
          err instanceof Error ? err.stack : err,
        );
      }
    }
  }

  async run(tenantId: string) {
    return generateExpiryAlerts(this.prisma, tenantId);
  }

  async list(
    tenantId: string,
    status: AlertStatus,
    take: number,
    skip: number,
  ) {
    const where: Prisma.AlertWhereInput = { tenantId, status };
    const [total, alerts] = await Promise.all([
      this.prisma.alert.count({ where }),
      this.prisma.alert.findMany({
        where,
        // Abiertas: primero lo que vence antes. Cerradas: primero lo más reciente.
        orderBy:
          status === AlertStatus.open
            ? [{ dueDate: 'asc' }, { title: 'asc' }]
            : [{ resolvedAt: 'desc' }],
        take,
        skip,
        include: { resolvedBy: { select: { fullName: true } } },
      }),
    ]);
    const licenses = await this.prisma.softwareLicense.findMany({
      where: { id: { in: alerts.map((a) => a.targetId) } },
      select: {
        id: true,
        softwareName: true,
        totalSeats: true,
        status: true,
        origin: true,
      },
    });
    const byId = new Map(licenses.map((l) => [l.id, l]));
    return {
      total,
      items: alerts.map((a) => ({
        ...a,
        dueDate: a.dueDate.toISOString().slice(0, 10),
        license: byId.get(a.targetId) ?? null,
      })),
    };
  }

  async counts(tenantId: string) {
    const groups = await this.prisma.alert.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { _all: true },
    });
    const count = (s: AlertStatus) =>
      groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      open: count(AlertStatus.open),
      acknowledged: count(AlertStatus.acknowledged),
      dismissed: count(AlertStatus.dismissed),
      autoResolved: count(AlertStatus.auto_resolved),
    };
  }

  async resolve(
    tenantId: string,
    actorUserId: string,
    id: string,
    status: 'acknowledged' | 'dismissed',
  ) {
    const alert = await this.prisma.alert.findFirst({
      where: { id, tenantId },
    });
    if (!alert) throw new NotFoundException('Alerta no encontrada');
    if (alert.status !== AlertStatus.open)
      throw new BadRequestException('La alerta ya no está abierta');
    const [updated] = await this.prisma.$transaction([
      this.prisma.alert.update({
        where: { id },
        data: { status, resolvedById: actorUserId, resolvedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'alert',
          entityId: id,
          action: status === 'acknowledged' ? 'acknowledge' : 'dismiss',
          metadata: {
            title: alert.title,
            dueDate: alert.dueDate.toISOString().slice(0, 10),
          },
        },
      }),
    ]);
    return updated;
  }

  async getRules(tenantId: string, role: string) {
    const rule = await this.prisma.alertRule.findUnique({
      where: { tenantId },
    });
    return {
      daysBefore: rule?.daysBefore?.length
        ? rule.daysBefore
        : DEFAULT_DAYS_BEFORE,
      includeExpired: rule?.includeExpired ?? true,
      enabled: rule?.enabled ?? true,
      canEdit: ALERT_ADMIN_ROLES.includes(role),
    };
  }

  async updateRules(
    tenantId: string,
    actorUserId: string,
    role: string,
    dto: UpdateAlertRulesDto,
  ) {
    const daysBefore = [...dto.daysBefore].sort((a, b) => b - a);
    const data = {
      daysBefore,
      includeExpired: dto.includeExpired,
      enabled: dto.enabled,
    };
    await this.prisma.$transaction([
      this.prisma.alertRule.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          entityType: 'alert_rules',
          entityId: tenantId,
          action: 'update',
          afterData: data,
        },
      }),
    ]);
    // Con los umbrales nuevos se recalcula de inmediato (no se espera a la revisión de mañana).
    const generated = await generateExpiryAlerts(this.prisma, tenantId);
    return { ...(await this.getRules(tenantId, role)), generated };
  }
}
