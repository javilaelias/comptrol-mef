import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIP,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AssetType } from '@prisma/client';

export class AgentSoftwareDto {
  @IsString()
  @MaxLength(240)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  publisher?: string;
}

export class AgentInventoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  assetTag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

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
  operatingSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsEnum(AssetType)
  assetType?: AssetType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cpuModel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(512)
  cpuCores?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2048)
  cpuLogical?: number;

  @IsOptional()
  @IsInt()
  @Min(128)
  @Max(1048576)
  ramMb?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1048576)
  storageGb?: number;

  @IsOptional()
  @IsDateString()
  collectedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentSoftwareDto)
  software?: AgentSoftwareDto[];
}
