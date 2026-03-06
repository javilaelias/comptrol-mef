import { Module } from '@nestjs/common';
import { EnadController } from './enad.controller';
import { EnadService } from './enad.service';

@Module({
  controllers: [EnadController],
  providers: [EnadService],
})
export class EnadModule {}

