import { Controller, Dependencies, Get, Req } from '@nestjs/common';
import { BalancesService } from './balances.service';

@Controller('balances')
@Dependencies(BalancesService)
class BalancesController {
  constructor(balancesService) {
    this.balances = balancesService;
  }

  @Get(':employeeId/:locationId')
  getOne(@Req() req) {
    const { employeeId, locationId } = req.params;
    const refresh = req.query.refresh;
    return this.balances.getBalance(employeeId, locationId, { refresh });
  }
}
export { BalancesController };
