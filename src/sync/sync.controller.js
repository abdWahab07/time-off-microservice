import { Controller, Dependencies, Post, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../common/auth/roles.decorator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SyncService } from './services/sync.service';

@Controller('sync/hcm')
@UseGuards(ApiKeyGuard, JwtAuthGuard, RolesGuard)
@Dependencies(SyncService)
class SyncController {
  constructor(syncService) {
    this.sync = syncService;
  }

  @Post('balances')
  @Roles('admin', 'system')
  batchBalances(@Req() req) {
    return this.sync.runBatch(req.body);
  }
}
export { SyncController };
