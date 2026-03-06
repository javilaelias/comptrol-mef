import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { CatalogService } from './catalog.service';

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('sites')
  async sites(@CurrentUser() user: JwtUserPayload) {
    return this.catalog.sites(user.tenantId);
  }

  @Get('locations')
  async locations(@CurrentUser() user: JwtUserPayload, @Query('siteId') siteId?: string) {
    return this.catalog.locations(user.tenantId, siteId);
  }

  @Get('org-units')
  async orgUnits(@CurrentUser() user: JwtUserPayload) {
    return this.catalog.orgUnits(user.tenantId);
  }
}

