import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { UpsertManualAnswerDto } from './dto/upsert-manual-answer.dto';
import { EnadService } from './enad.service';

@Controller('enad')
@UseGuards(JwtAuthGuard)
export class EnadController {
  constructor(private readonly enad: EnadService) {}

  @Get('surveys')
  async surveys(@CurrentUser() user: JwtUserPayload) {
    return this.enad.listSurveys(user.tenantId);
  }

  @Get('summary')
  async summary(@CurrentUser() user: JwtUserPayload, @Query('year', new ParseIntPipe({ optional: true })) year?: number) {
    return this.enad.getSummary(user.tenantId, year);
  }

  @Get('surveys/:year/items')
  async items(
    @CurrentUser() user: JwtUserPayload,
    @Param('year', ParseIntPipe) year: number,
    @Query('questionCode', new ParseIntPipe({ optional: true })) questionCode?: number,
  ) {
    return this.enad.listItems(user.tenantId, year, questionCode);
  }

  @Get('surveys/:year/manual-answers')
  async manualAnswers(@CurrentUser() user: JwtUserPayload, @Param('year', ParseIntPipe) year: number) {
    return this.enad.getManualAnswers(user.tenantId, year);
  }

  @Put('surveys/:year/manual-answers/:questionCode')
  async upsertManualAnswer(
    @CurrentUser() user: JwtUserPayload,
    @Param('year', ParseIntPipe) year: number,
    @Param('questionCode', ParseIntPipe) questionCode: number,
    @Body() dto: UpsertManualAnswerDto,
  ) {
    return this.enad.upsertManualAnswer(user.tenantId, year, questionCode, dto);
  }
}

