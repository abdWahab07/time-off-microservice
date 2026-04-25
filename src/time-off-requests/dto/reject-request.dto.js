import { IsOptional, IsString } from 'class-validator';

export class RejectRequestDto {
  @IsString()
  managerId;

  @IsOptional()
  @IsString()
  reason;
}
