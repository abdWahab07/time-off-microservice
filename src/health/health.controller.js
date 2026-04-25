import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@Controller('health')
class HealthController {
  @Get()
  @UseGuards(ApiKeyGuard)
  check() {
    return { status: 'ok', service: 'time-off-microservice' };
  }
}
export { HealthController };
