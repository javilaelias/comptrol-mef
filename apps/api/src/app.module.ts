import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AssetsModule } from './modules/assets/assets.module';
import { AuthModule } from './modules/auth/auth.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LicensesModule } from './modules/licenses/licenses.module';
import { ReportsModule } from './modules/reports/reports.module';
import { EnadModule } from './modules/enad/enad.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    DashboardModule,
    AssetsModule,
    ApplicationsModule,
    CatalogModule,
    LicensesModule,
    ReportsModule,
    EnadModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
