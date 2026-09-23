import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUserPayload } from '../auth/jwt.strategy';
import { UploadCoordinatorDto } from './dto/upload-coordinator.dto';
import {
  IntangibleListFilters,
  IntangiblesService,
} from './intangibles.service';
import { ReconciliationService } from './reconciliation.service';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const pick = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined);

const flag = (value?: string) => value === '1' || value === 'true';

@Controller('intangibles')
@UseGuards(JwtAuthGuard)
export class IntangiblesController {
  constructor(
    private readonly intangibles: IntangiblesService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: JwtUserPayload,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('condition') condition?: string,
    @Query('expiry') expiry?: string,
    @Query('suspicious') suspicious?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take = 50,
    @Query('skip', new ParseIntPipe({ optional: true })) skip = 0,
  ) {
    const filters: IntangibleListFilters = {
      search,
      status: pick(status, ['active', 'retired', 'excel_only'] as const),
      condition: pick(condition, ['definida', 'indefinida', 'none'] as const),
      expiry: pick(expiry, ['expired', 'expiring', 'valid', 'none'] as const),
      suspicious: flag(suspicious),
      take: Math.max(1, Math.min(take, 200)),
      skip: Math.max(0, skip),
    };
    return this.intangibles.list(user.tenantId, filters);
  }

  @Get('batches')
  async batches(@CurrentUser() user: JwtUserPayload) {
    return this.intangibles.listBatches(user.tenantId);
  }

  /** Subida del Excel del coordinador: cualquier usuario de Comptrol (queda en auditoría). */
  @Post('batches/coordinator')
  @UseInterceptors(
    // Sin `dest`, multer guarda el archivo en memoria (no se escribe nada en disco).
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(
    @CurrentUser() user: JwtUserPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadCoordinatorDto,
  ) {
    return this.intangibles.uploadCoordinator(
      user.tenantId,
      user.sub,
      file,
      dto.cutDate,
    );
  }

  @Post('batches/:id/make-current')
  async makeCurrent(
    @CurrentUser() user: JwtUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.intangibles.makeCurrent(user.tenantId, user.sub, id);
  }

  @Get('reconciliation/summary')
  async summary(@CurrentUser() user: JwtUserPayload) {
    return this.reconciliation.summary(user.tenantId);
  }

  @Get('reconciliation/:view/export')
  async export(
    @CurrentUser() user: JwtUserPayload,
    @Param('view') view: string,
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('subset') subset?: string,
    @Query('suspicious') suspicious?: string,
    @Query('onlyDiff') onlyDiff?: string,
  ) {
    const file = await this.reconciliation.export(
      user.tenantId,
      this.reconciliation.assertView(view),
      {
        search,
        subset,
        suspicious: flag(suspicious),
        onlyDiff: flag(onlyDiff),
      },
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Get('reconciliation/:view')
  async view(
    @CurrentUser() user: JwtUserPayload,
    @Param('view') view: string,
    @Query('search') search?: string,
    @Query('subset') subset?: string,
    @Query('suspicious') suspicious?: string,
    @Query('onlyDiff') onlyDiff?: string,
    @Query('take', new ParseIntPipe({ optional: true })) take = 50,
    @Query('skip', new ParseIntPipe({ optional: true })) skip = 0,
  ) {
    return this.reconciliation.view(
      user.tenantId,
      this.reconciliation.assertView(view),
      {
        search,
        subset,
        suspicious: flag(suspicious),
        onlyDiff: flag(onlyDiff),
        take: Math.max(1, Math.min(take, 200)),
        skip: Math.max(0, skip),
      },
    );
  }

  @Get(':code')
  async detail(
    @CurrentUser() user: JwtUserPayload,
    @Param('code') code: string,
  ) {
    return this.intangibles.detail(user.tenantId, code.slice(0, 40));
  }
}
