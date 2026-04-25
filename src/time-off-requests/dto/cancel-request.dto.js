import { IsOptional, IsString } from 'class-validator';

export class CancelRequestDto {
  @IsString()
  cancelledBy;

  @IsOptional()
  @IsString()
  reason;
}
