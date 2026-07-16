import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live() {
    return {
      status: 'ok',
      uptimeSec: Math.trunc(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    const dbOk = await this.health.isDatabaseReady();
    if (!dbOk) {
      throw new ServiceUnavailableException({
        status: 'fail',
        checks: { db: 'down' },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      checks: { db: 'up' },
      timestamp: new Date().toISOString(),
    };
  }
}
