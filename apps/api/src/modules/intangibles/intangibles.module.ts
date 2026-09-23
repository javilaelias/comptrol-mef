import { Module } from '@nestjs/common';
import { LicensesModule } from '../licenses/licenses.module';
import { IntangiblesController } from './intangibles.controller';
import { IntangiblesService } from './intangibles.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [LicensesModule],
  controllers: [IntangiblesController],
  providers: [IntangiblesService, ReconciliationService],
  exports: [IntangiblesService],
})
export class IntangiblesModule {}
