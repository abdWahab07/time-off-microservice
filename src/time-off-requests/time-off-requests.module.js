import { Module } from '@nestjs/common';
import { TimeOffRequestsController } from './time-off-requests.controller';
import { TimeOffRequestsService } from './time-off-requests.service';
import { TimeOffRequestsRepository } from './time-off-requests.repository';
import { ReservationsRepository } from './reservations.repository';
import { HcmOperationsRepository } from './hcm-operations.repository';
import { HcmModule } from '../hcm/hcm.module';
import { AuditModule } from '../audit/audit.module';
import { BalancesModule } from '../balances/balances.module';

@Module({
  imports: [HcmModule, AuditModule, BalancesModule],
  controllers: [TimeOffRequestsController],
  providers: [
    TimeOffRequestsRepository,
    ReservationsRepository,
    HcmOperationsRepository,
    TimeOffRequestsService,
  ],
  exports: [TimeOffRequestsService, TimeOffRequestsRepository],
})
class TimeOffRequestsModule {}
export { TimeOffRequestsModule };
