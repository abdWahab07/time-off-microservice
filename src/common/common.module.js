import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './guards/api-key.guard';

@Global()
@Module({
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard],
})
class CommonModule {}
export { CommonModule };
