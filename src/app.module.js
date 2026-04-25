import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { HcmModule } from './hcm/hcm.module';
import { AuditModule } from './audit/audit.module';
import { BalancesModule } from './balances/balances.module';
import { TimeOffRequestsModule } from './time-off-requests/time-off-requests.module';
import { SyncModule } from './sync/sync.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    CommonModule,
    DatabaseModule,
    HcmModule,
    AuditModule,
    BalancesModule,
    TimeOffRequestsModule,
    SyncModule,
    HealthModule,
  ],
})
class AppModule {}
export { AppModule };
