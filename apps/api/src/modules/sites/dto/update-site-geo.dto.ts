import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateSiteGeoDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}

