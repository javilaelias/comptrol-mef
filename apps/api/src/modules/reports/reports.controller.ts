import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('operational/stale-assets')
  async staleAssets(
    @CurrentUser() user: JwtUserPayload,
    @Query('days', new ParseIntPipe({ optional: true })) days = 30,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 100,
  ) {
    return this.reports.staleAssets(user.tenantId, Math.max(1, Math.min(days, 365)), Math.max(1, Math.min(limit, 500)));
  }

  @Get('tactical/ewaste-trend')
  async ewasteTrend(
    @CurrentUser() user: JwtUserPayload,
    @Query('months', new ParseIntPipe({ optional: true })) months = 12,
  ) {
    return this.reports.ewasteTrend(user.tenantId, Math.max(1, Math.min(months, 36)));
  }

  @Get('gerencial/inventory-value-by-site')
  async inventoryValueBySite(@CurrentUser() user: JwtUserPayload) {
    return this.reports.inventoryValueBySite(user.tenantId);
  }
}

