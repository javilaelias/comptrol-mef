import { Module } from '@nestjs/common';
import { IntangiblesController } from './intangibles.controller';
import { IntangiblesService } from './intangibles.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  controllers: [IntangiblesController],
  providers: [IntangiblesService, ReconciliationService],
  exports: [IntangiblesService],
})
export class IntangiblesModule {}
