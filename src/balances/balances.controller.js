import { Controller, Dependencies, Get, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { Roles } from '../common/auth/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BalanceEmployeeParamGuard } from './guards/balance-employee-param.guard';
import { BalancesService } from './services/balances.service';

@Controller('balances')
@Dependencies(BalancesService)
class BalancesController {
  constructor(balancesService) {
    this.balances = balancesService;
  }

  @Get(':employeeId/:locationId')
  @Roles('employee', 'manager', 'admin', 'system')
  @UseGuards(ApiKeyGuard, JwtAuthGuard, RolesGuard, BalanceEmployeeParamGuard)
  getOne(@Req() req) {
    const { employeeId, locationId } = req.params;
    const refresh = req.query.refresh;
    return this.balances.getBalance(employeeId, locationId, { refresh });
  }
}
export { BalancesController };
