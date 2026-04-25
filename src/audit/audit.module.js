import { Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
class AuditModule {}
export { AuditModule };
