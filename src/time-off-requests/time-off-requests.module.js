import { Module } from '@nestjs/common';
import { TimeOffRequestsController } from './time-off-requests.controller';
import { TimeOffRequestsService } from './services/time-off-requests.service';
import { TimeOffRequestsRepository } from './repositories/time-off-requests.repository';
import { ReservationsRepository } from './repositories/reservations.repository';
import { HcmOperationsRepository } from './repositories/hcm-operations.repository';
import { HcmModule } from '../hcm/hcm.module';
import { AuditModule } from '../audit/audit.module';
import { BalancesModule } from '../balances/balances.module';
import {
  CancelActorGuard,
  TimeOffByIdReadGuard,
  TimeOffListQueryGuard,
} from './guards/time-off-access.guards';

@Module({
  imports: [HcmModule, AuditModule, BalancesModule],
  controllers: [TimeOffRequestsController],
  providers: [
    TimeOffRequestsRepository,
    ReservationsRepository,
    HcmOperationsRepository,
    TimeOffRequestsService,
    TimeOffListQueryGuard,
    TimeOffByIdReadGuard,
    CancelActorGuard,
  ],
  exports: [TimeOffRequestsService, TimeOffRequestsRepository],
})
class TimeOffRequestsModule {}
export { TimeOffRequestsModule };
