import { Module } from '@nestjs/common';
import { BalancesController } from './balances.controller';
import { BalancesService } from './services/balances.service';
import { BalancesRepository } from './repositories/balances.repository';
import { HcmModule } from '../hcm/hcm.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [HcmModule, AuditModule],
  controllers: [BalancesController],
  providers: [BalancesService, BalancesRepository],
  exports: [BalancesService, BalancesRepository],
})
class BalancesModule {}
export { BalancesModule };
