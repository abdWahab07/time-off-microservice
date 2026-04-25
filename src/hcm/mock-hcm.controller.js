import { Controller, Dependencies, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { MockHcmService } from './mock-hcm.service';

@Controller('mock-hcm')
@UseGuards(ApiKeyGuard)
@Dependencies(MockHcmService)
class MockHcmController {
  constructor(mockHcmService) {
    this.mockHcm = mockHcmService;
  }

  @Get('balances/:employeeId/:locationId')
  getBalance(@Req() req) {
    return this.mockHcm.getBalance(req.params.employeeId, req.params.locationId);
  }

  @Post('time-off')
  fileTimeOff(@Req() req) {
    return this.mockHcm.fileTimeOff(req.body);
  }

  @Post('time-off/:transactionId/cancel')
  cancel(@Req() req) {
    return this.mockHcm.cancelTimeOff(req.params.transactionId);
  }

  @Post('balances')
  seed(@Req() req) {
    return this.mockHcm.seedBalance(req.body);
  }

  @Post('failure-mode')
  failureMode(@Req() req) {
    return this.mockHcm.setFailureMode(req.body);
  }
}
export { MockHcmController };
