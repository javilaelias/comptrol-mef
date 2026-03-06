import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationsService } from './applications.service';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('search') search?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take = 50,
    @Query('skip', new ParseIntPipe({ optional: true })) skip = 0,
  ) {
    return this.applications.list(user.tenantId, { search, take: Math.max(1, Math.min(take, 200)), skip: Math.max(0, skip) });
  }

  @Get(':id')
  async get(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.applications.get(user.tenantId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtUserPayload, @Body() dto: CreateApplicationDto) {
    return this.applications.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  async update(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() dto: UpdateApplicationDto) {
    return this.applications.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.applications.remove(user.tenantId, user.sub, id);
  }
}

