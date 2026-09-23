import { IsDateString } from 'class-validator';

export class UploadCoordinatorDto {
  /** Fecha de corte del Excel (YYYY-MM-DD), p. ej. 2026-06-30 para "INTANGIBLES AL 30.06". */
  @IsDateString({ strict: true })
  cutDate!: string;
}
