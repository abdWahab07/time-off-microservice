import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DATABASE_CONNECTION } from './database.constants';
import { openDatabase } from './sqlite.client';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (config) => {
        const url = config.get('DATABASE_URL', './data/timeoff.db');
        return openDatabase(url, { runMigrations: true });
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
class DatabaseModule {}
export { DatabaseModule };
