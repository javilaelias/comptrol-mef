import { IsIP, IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentHeartbeatDto {
  @IsString()
  @MaxLength(80)
  assetTag!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  hostname?: string;

  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(17)
  macAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  operatingSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;
}

