import { Module } from '@nestjs/common';
import { MockHcmService } from './services/mock-hcm.service';
import { MockHcmController } from './mock-hcm.controller';
import { HcmClientService } from './services/hcm-client.service';

function useExternalHcm() {
  const v = process.env.HCM_BASE_URL;
  return typeof v === 'string' && v.trim().length > 0;
}

@Module({
  controllers: useExternalHcm() ? [] : [MockHcmController],
  providers: [MockHcmService, HcmClientService],
  exports: [HcmClientService, MockHcmService],
})
class HcmModule {}
export { HcmModule };
