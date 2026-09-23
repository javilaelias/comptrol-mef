import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export class UpdateAlertRulesDto {
  /** Días de anticipación, p. ej. [90, 60, 30, 7]. */
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(365, { each: true })
  daysBefore!: number[];

  @IsBoolean()
  includeExpired!: boolean;

  @IsBoolean()
  enabled!: boolean;
}
