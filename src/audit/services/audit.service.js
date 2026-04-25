import { Dependencies, Injectable } from '@nestjs/common';
import { AuditRepository } from '../repositories/audit.repository';

@Injectable()
@Dependencies(AuditRepository)
class AuditService {
  constructor(auditRepository) {
    this.repo = auditRepository;
  }

  log(entityType, entityId, action, metadata) {
    return this.repo.insert({ entityType, entityId, action, metadata });
  }

  listForRequest(requestId) {
    return this.repo.list({ entityId: requestId });
  }
}
export { AuditService };
