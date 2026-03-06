import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertManualAnswerDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  selectedOptionCodes?: string[];

  @IsOptional()
  @IsString()
  answerText?: string;
}
