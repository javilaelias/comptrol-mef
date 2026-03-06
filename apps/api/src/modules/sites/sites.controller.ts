import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { UpdateSiteGeoDto } from './dto/update-site-geo.dto';
import { SitesService } from './sites.service';

@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  async list(@CurrentUser() user: JwtUserPayload) {
    return this.sites.list(user.tenantId);
  }

  @Patch(':id/geo')
  @Roles('super_admin', 'it_admin')
  async updateGeo(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() dto: UpdateSiteGeoDto) {
    return this.sites.updateGeo(user.tenantId, user.sub, id, dto);
  }
}

