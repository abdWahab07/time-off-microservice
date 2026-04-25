import { Module } from '@nestjs/common';
import { AuditRepository } from './repositories/audit.repository';
import { AuditService } from './services/audit.service';

@Module({
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
class AuditModule {}
export { AuditModule };
