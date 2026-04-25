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
import { TimeOffRequestsService } from './time-off-requests.service';

@Controller('time-off-requests')
@Dependencies(TimeOffRequestsService)
class TimeOffRequestsController {
  constructor(timeOffRequestsService) {
    this.service = timeOffRequestsService;
  }

  @Post()
  @UseGuards(ApiKeyGuard)
  async create(@Req() req, @Res({ passthrough: true }) res) {
    const out = await this.service.create(req.body);
    res.status(
      out.idempotentReplay ? HttpStatus.OK : HttpStatus.CREATED,
    );
    return out.payload;
  }

  @Get()
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
  getOne(@Req() req) {
    return this.service.getById(req.params.id);
  }

  @Post(':id/approve')
  @UseGuards(ApiKeyGuard)
  approve(@Req() req) {
    return this.service.approve(req.params.id, req.body);
  }

  @Post(':id/reject')
  @UseGuards(ApiKeyGuard)
  reject(@Req() req) {
    return this.service.reject(req.params.id, req.body);
  }

  @Post(':id/cancel')
  @UseGuards(ApiKeyGuard)
  cancel(@Req() req) {
    return this.service.cancel(req.params.id, req.body);
  }
}
export { TimeOffRequestsController };
