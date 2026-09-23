import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { AlertsService } from './alerts.service';
import { UpdateAlertRulesDto } from './dto/update-alert-rules.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('status') status?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take = 50,
    @Query('skip', new ParseIntPipe({ optional: true })) skip = 0,
  ) {
    const s = Object.values(AlertStatus).includes(status as AlertStatus)
      ? (status as AlertStatus)
      : AlertStatus.open;
    return this.alerts.list(
      user.tenantId,
      s,
      Math.max(1, Math.min(take, 200)),
      Math.max(0, skip),
    );
  }

  /** Para el contador del menú. */
  @Get('count')
  async count(@CurrentUser() user: JwtUserPayload) {
    return this.alerts.counts(user.tenantId);
  }

  @Get('rules')
  async rules(@CurrentUser() user: JwtUserPayload) {
    return this.alerts.getRules(user.tenantId, user.role);
  }

  @Put('rules')
  @Roles('super_admin', 'it_admin')
  async updateRules(
    @CurrentUser() user: JwtUserPayload,
    @Body() dto: UpdateAlertRulesDto,
  ) {
    return this.alerts.updateRules(user.tenantId, user.sub, user.role, dto);
  }

  /** Fuerza la revisión de vencimientos sin esperar a la de las 07:00. */
  @Post('run')
  @Roles('super_admin', 'it_admin')
  async run(@CurrentUser() user: JwtUserPayload) {
    return this.alerts.run(user.tenantId);
  }

  @Post(':id/acknowledge')
  async acknowledge(
    @CurrentUser() user: JwtUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alerts.resolve(user.tenantId, user.sub, id, 'acknowledged');
  }

  @Post(':id/dismiss')
  async dismiss(
    @CurrentUser() user: JwtUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alerts.resolve(user.tenantId, user.sub, id, 'dismissed');
  }
}
