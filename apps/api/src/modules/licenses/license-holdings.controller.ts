import { Controller, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { LicenseHoldingsService } from './license-holdings.service';

@Controller('licenses/holdings')
@UseGuards(JwtAuthGuard)
export class LicenseHoldingsController {
  constructor(private readonly holdings: LicenseHoldingsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('search') search?: string,
    @Query('executingUnit') executingUnit?: string,
    @Query('category') category?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take = 50,
    @Query('skip', new ParseIntPipe({ optional: true })) skip = 0,
  ) {
    return this.holdings.list(user.tenantId, {
      search,
      executingUnit,
      category,
      take: Math.max(1, Math.min(take, 200)),
      skip: Math.max(0, skip),
    });
  }

  @Get('summary/by-software')
  async summaryBySoftware(@CurrentUser() user: JwtUserPayload) {
    return this.holdings.summaryBySoftware(user.tenantId);
  }

  @Get('summary/by-executing-unit')
  async summaryByExecutingUnit(@CurrentUser() user: JwtUserPayload) {
    return this.holdings.summaryByExecutingUnit(user.tenantId);
  }
}

