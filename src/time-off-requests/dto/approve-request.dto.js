import { IsString } from 'class-validator';

export class ApproveRequestDto {
  @IsString()
  managerId;
}
