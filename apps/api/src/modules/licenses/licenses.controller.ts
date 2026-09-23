import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LicenseStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { LicensesService } from './licenses.service';

@Controller('licenses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('origin') origin?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take = 50,
    @Query('skip', new ParseIntPipe({ optional: true })) skip = 0,
  ) {
    return this.licenses.list(user.tenantId, {
      search,
      status: Object.values(LicenseStatus).includes(status as LicenseStatus)
        ? (status as LicenseStatus)
        : undefined,
      origin:
        origin === 'manual' || origin === 'intangibles' ? origin : undefined,
      take: Math.max(1, Math.min(take, 200)),
      skip: Math.max(0, skip),
    });
  }

  @Get(':id/intangibles')
  async members(
    @CurrentUser() user: JwtUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.licenses.members(user.tenantId, id);
  }

  /** Fuerza la regeneración de las licencias desde los intangibles vigentes. */
  @Post('regenerate')
  @Roles('super_admin', 'it_admin')
  async regenerate(@CurrentUser() user: JwtUserPayload) {
    return this.licenses.regenerate(user.tenantId, user.sub, 'manual');
  }
}
