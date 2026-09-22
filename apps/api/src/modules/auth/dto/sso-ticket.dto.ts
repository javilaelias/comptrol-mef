import { IsString, MinLength } from 'class-validator';

export class SsoTicketDto {
  @IsString()
  @MinLength(1)
  ticket!: string;
}
