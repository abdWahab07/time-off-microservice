import { HttpStatus } from '@nestjs/common';
import {
  HcmClientException,
  mapHcmClientExceptionToHttp,
} from './hcm-error.mapper';
import { HcmClientErrorCode } from './hcm.types';

describe('mapHcmClientExceptionToHttp', () => {
  it('maps insufficient balance to 409', () => {
    const ex = mapHcmClientExceptionToHttp(
      new HcmClientException(
        HcmClientErrorCode.INSUFFICIENT_BALANCE,
        'no balance',
      ),
    );
    expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('maps HCM_UNAVAILABLE to 503', () => {
    const ex = mapHcmClientExceptionToHttp(
      new HcmClientException(HcmClientErrorCode.HCM_UNAVAILABLE, 'down'),
    );
    expect(ex.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
