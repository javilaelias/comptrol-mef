import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { DiscoveryIngestDto } from './dto/discovery-ingest.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Controller('assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('siteId') siteId?: string,
    @Query('orgUnitId') orgUnitId?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take = 50,
    @Query('skip', new ParseIntPipe({ optional: true })) skip = 0,
  ) {
    return this.assets.list(user.tenantId, {
      search,
      status,
      siteId,
      orgUnitId,
      take: Math.max(1, Math.min(take, 200)),
      skip: Math.max(0, skip),
    });
  }

  @Get('by-tag/:assetTag')
  async getByTag(@CurrentUser() user: JwtUserPayload, @Param('assetTag') assetTag: string) {
    return this.assets.getByAssetTag(user.tenantId, assetTag);
  }

  @Get(':id')
  async get(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.assets.getById(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtUserPayload, @Body() dto: CreateAssetDto) {
    return this.assets.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  async retire(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.assets.retire(user.tenantId, user.sub, id);
  }

  @Post('discovery')
  @HttpCode(HttpStatus.CREATED)
  async ingestDiscovery(@CurrentUser() user: JwtUserPayload, @Body() dto: DiscoveryIngestDto) {
    const result = await this.assets.ingestDiscovery(user.tenantId, user.sub, dto);
    return {
      success: true,
      message: 'Asset discovery ingested successfully',
      data: result.asset,
      audit: result.audit,
    };
  }
}
