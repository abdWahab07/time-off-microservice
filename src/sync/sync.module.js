import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './services/sync.service';
import { SyncRepository } from './repositories/sync.repository';
import { BalancesModule } from '../balances/balances.module';
import { AuditModule } from '../audit/audit.module';
import { TimeOffRequestsRepository } from '../time-off-requests/repositories/time-off-requests.repository';

@Module({
  imports: [BalancesModule, AuditModule],
  controllers: [SyncController],
  providers: [SyncService, SyncRepository, TimeOffRequestsRepository],
})
class SyncModule {}
export { SyncModule };
