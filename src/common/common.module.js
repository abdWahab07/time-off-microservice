import { Global, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmployeeSelfBodyGuard } from './guards/employee-self-body.guard';
import { ManagerSelfBodyGuard } from './guards/manager-self-body.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtVerificationService } from './services/jwt-verification.service';
import { SecurityEventsService } from './services/security-events.service';

@Global()
@Module({
  providers: [
    Reflector,
    ApiKeyGuard,
    JwtVerificationService,
    JwtAuthGuard,
    RolesGuard,
    EmployeeSelfBodyGuard,
    ManagerSelfBodyGuard,
    SecurityEventsService,
  ],
  exports: [
    Reflector,
    ApiKeyGuard,
    JwtVerificationService,
    JwtAuthGuard,
    RolesGuard,
    EmployeeSelfBodyGuard,
    ManagerSelfBodyGuard,
    SecurityEventsService,
  ],
})
class CommonModule {}
export { CommonModule };
