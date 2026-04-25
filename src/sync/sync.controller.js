import { Controller, Dependencies, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { SyncService } from './services/sync.service';

@Controller('sync/hcm')
@UseGuards(ApiKeyGuard)
@Dependencies(SyncService)
class SyncController {
  constructor(syncService) {
    this.sync = syncService;
  }

  @Post('balances')
  batchBalances(@Req() req) {
    return this.sync.runBatch(req.body);
  }
}
export { SyncController };
