import { Dependencies, Injectable } from '@nestjs/common';
import { MockHcmService } from './mock-hcm.service';

/**
 * In-process HCM adapter. Production would swap HTTP + auth against HCM_BASE_URL.
 */
@Injectable()
@Dependencies(MockHcmService)
class HcmClientService {
  constructor(mockHcmService) {
    this.mockHcm = mockHcmService;
  }

  getBalance(employeeId, locationId) {
    return this.mockHcm.getBalance(employeeId, locationId);
  }

  fileTimeOff(payload) {
    return this.mockHcm.fileTimeOff(payload);
  }

  cancelTimeOff(transactionId) {
    return this.mockHcm.cancelTimeOff(transactionId);
  }
}
export { HcmClientService };
