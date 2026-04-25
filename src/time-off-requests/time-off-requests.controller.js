import {
  Controller,
  Dependencies,
  Get,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/auth/roles.decorator';
import { EmployeeSelfBodyGuard } from '../common/guards/employee-self-body.guard';
import { ManagerSelfBodyGuard } from '../common/guards/manager-self-body.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  CancelActorGuard,
  TimeOffByIdReadGuard,
  TimeOffListQueryGuard,
} from './guards/time-off-access.guards';
import { TimeOffRequestsService } from './services/time-off-requests.service';

@Controller('time-off-requests')
@UseGuards(ApiKeyGuard, JwtAuthGuard, RolesGuard)
@Dependencies(TimeOffRequestsService)
class TimeOffRequestsController {
  constructor(timeOffRequestsService) {
    this.service = timeOffRequestsService;
  }

  @Post()
  @Roles('employee', 'admin', 'system')
  @UseGuards(EmployeeSelfBodyGuard)
  async create(@Req() req, @Res({ passthrough: true }) res) {
    const out = await this.service.create(req.body);
    res.status(
      out.idempotentReplay ? HttpStatus.OK : HttpStatus.CREATED,
    );
    return out.payload;
  }

  @Get()
  @Roles('employee', 'manager', 'admin', 'system')
  @UseGuards(TimeOffListQueryGuard)
  list(@Req() req) {
    const { employeeId, locationId, status, managerId } = req.query;
    return this.service.list({
      employeeId,
      locationId,
      status,
      managerId,
    });
  }

  @Get(':id')
  @Roles('employee', 'manager', 'admin', 'system')
  @UseGuards(TimeOffByIdReadGuard)
  getOne(@Req() req) {
    return this.service.getById(req.params.id);
  }

  @Post(':id/approve')
  @Roles('manager', 'admin', 'system')
  @UseGuards(ManagerSelfBodyGuard)
  approve(@Req() req) {
    return this.service.approve(req.params.id, req.body);
  }

  @Post(':id/reject')
  @Roles('manager', 'admin', 'system')
  @UseGuards(ManagerSelfBodyGuard)
  reject(@Req() req) {
    return this.service.reject(req.params.id, req.body);
  }

  @Post(':id/cancel')
  @Roles('employee', 'manager', 'admin', 'system')
  @UseGuards(CancelActorGuard)
  cancel(@Req() req) {
    return this.service.cancel(req.params.id, req.body);
  }
}
export { TimeOffRequestsController };
