import { Controller, Get } from '@nestjs/common';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'time-off-microservice' };
  }
}
export { HealthController };
