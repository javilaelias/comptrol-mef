import { Module } from '@nestjs/common';
import { LicenseHoldingsController } from './license-holdings.controller';
import { LicenseHoldingsService } from './license-holdings.service';

@Module({
  controllers: [LicenseHoldingsController],
  providers: [LicenseHoldingsService],
})
export class LicensesModule {}

