import { Module } from '@nestjs/common';
import { MockHcmService } from './services/mock-hcm.service';
import { MockHcmController } from './mock-hcm.controller';
import { HcmClientService } from './services/hcm-client.service';

@Module({
  controllers: [MockHcmController],
  providers: [MockHcmService, HcmClientService],
  exports: [HcmClientService, MockHcmService],
})
class HcmModule {}
export { HcmModule };
