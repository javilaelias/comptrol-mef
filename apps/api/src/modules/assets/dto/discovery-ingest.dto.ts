import { IsEnum, IsIP, IsOptional, IsString, MaxLength } from 'class-validator';

export enum DiscoverySource {
  discovery_active = 'discovery_active',
  discovery_passive = 'discovery_passive',
}

export class DiscoveryIngestDto {
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

  @IsString()
  @MaxLength(40)
  assetType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsEnum(DiscoverySource)
  source!: DiscoverySource;
}

