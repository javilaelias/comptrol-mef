import { Module } from '@nestjs/common';
import { LicenseHoldingsController } from './license-holdings.controller';
import { LicenseHoldingsService } from './license-holdings.service';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';

@Module({
  controllers: [LicenseHoldingsController, LicensesController],
  providers: [LicenseHoldingsService, LicensesService],
  exports: [LicensesService],
})
export class LicensesModule {}
