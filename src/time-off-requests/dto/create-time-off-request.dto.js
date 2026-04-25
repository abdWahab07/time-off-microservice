import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateTimeOffRequestDto {
  @IsString()
  employeeId;

  @IsString()
  locationId;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate;

  @IsInt()
  @Min(1)
  requestedDays;

  @IsOptional()
  @IsString()
  reason;

  @IsOptional()
  @IsString()
  idempotencyKey;
}
