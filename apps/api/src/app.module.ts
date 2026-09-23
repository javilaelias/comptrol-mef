import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AssetsModule } from './modules/assets/assets.module';
import { AuthModule } from './modules/auth/auth.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LicensesModule } from './modules/licenses/licenses.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EnadModule } from './modules/enad/enad.module';
import { IntangiblesModule } from './modules/intangibles/intangibles.module';
import { AgentModule } from './modules/agent/agent.module';
import { SitesModule } from './modules/sites/sites.module';
import { HealthModule } from './modules/health/health.module';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL_SEC') ?? 60),
            limit: Number(config.get('THROTTLE_LIMIT') ?? 300),
          },
        ],
        skipIf: () => config.get('THROTTLE_ENABLED') === false,
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    DashboardModule,
    AssetsModule,
    ApplicationsModule,
    CatalogModule,
    LicensesModule,
    ReportsModule,
    EnadModule,
    IntangiblesModule,
    AgentModule,
    SitesModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
