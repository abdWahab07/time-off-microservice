import { Module } from '@nestjs/common';
import { MockHcmService } from './mock-hcm.service';
import { MockHcmController } from './mock-hcm.controller';
import { HcmClientService } from './hcm-client.service';

@Module({
  controllers: [MockHcmController],
  providers: [MockHcmService, HcmClientService],
  exports: [HcmClientService, MockHcmService],
})
class HcmModule {}
export { HcmModule };
