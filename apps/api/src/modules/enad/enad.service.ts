import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function decToNumber(v: unknown) {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

@Injectable()
export class EnadService {
  constructor(private readonly prisma: PrismaService) {}

  async listSurveys(tenantId: string) {
    return this.prisma.enadSurvey.findMany({
      where: { tenantId },
      orderBy: { year: 'desc' },
      select: { year: true, asOfDate: true, sourceDocument: true, updatedAt: true },
    });
  }

  async getSurveyByYear(tenantId: string, year: number) {
    return this.prisma.enadSurvey.findUnique({
      where: { tenantId_year: { tenantId, year } },
      select: { id: true, year: true, asOfDate: true, sourceDocument: true },
    });
  }

  async getLatestSurvey(tenantId: string) {
    return this.prisma.enadSurvey.findFirst({
      where: { tenantId },
      orderBy: [{ year: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, year: true, asOfDate: true, sourceDocument: true },
    });
  }

  async listItems(tenantId: string, year: number, questionCode?: number) {
    const survey = await this.getSurveyByYear(tenantId, year);
    if (!survey) return { available: false, items: [] as any[] };
    const items = await this.prisma.enadItem.findMany({
      where: { surveyId: survey.id, ...(questionCode ? { questionCode } : {}) },
      orderBy: [{ questionCode: 'asc' }, { code: 'asc' }],
      select: { code: true, questionCode: true, label: true, value1: true, value2: true, valueText: true },
    });
    return {
      available: true,
      survey,
      items: items.map((i) => ({
        code: i.code,
        questionCode: i.questionCode,
        label: i.label,
        value1: i.value1 !== null ? decToNumber(i.value1) : null,
        value2: i.value2 !== null ? decToNumber(i.value2) : null,
        valueText: i.valueText,
      })),
    };
  }

  async getManualAnswers(tenantId: string, year: number) {
    const survey = await this.getSurveyByYear(tenantId, year);
    if (!survey) return { available: false, answers: [] as any[] };

    const answers = await this.prisma.enadManualAnswer.findMany({
      where: { surveyId: survey.id },
      orderBy: { questionCode: 'asc' },
      select: { questionCode: true, selectedOptionCodes: true, answerText: true, updatedAt: true },
    });

    return { available: true, survey, answers };
  }

  async upsertManualAnswer(
    tenantId: string,
    year: number,
    questionCode: number,
    data: { selectedOptionCodes?: string[]; answerText?: string },
  ) {
    const survey = await this.getSurveyByYear(tenantId, year);
    if (!survey) return { available: false };

    const selectedOptionCodes = (data.selectedOptionCodes ?? []).map((s) => String(s).slice(0, 40));
    const answerText = data.answerText ?? null;

    const saved = await this.prisma.enadManualAnswer.upsert({
      where: { surveyId_questionCode: { surveyId: survey.id, questionCode } },
      create: {
        surveyId: survey.id,
        questionCode,
        selectedOptionCodes,
        answerText,
      },
      update: {
        selectedOptionCodes,
        answerText,
      },
      select: { questionCode: true, selectedOptionCodes: true, answerText: true, updatedAt: true },
    });

    return { available: true, survey, answer: saved };
  }

  async getSummary(tenantId: string, year?: number) {
    const survey = year ? await this.getSurveyByYear(tenantId, year) : await this.getLatestSurvey(tenantId);
    if (!survey) return { available: false };

    const [items, manualAnswers, assetsByType] = await Promise.all([
      this.prisma.enadItem.findMany({
        where: { surveyId: survey.id, questionCode: { in: [10, 11, 14, 16, 18, 20] } },
        select: { questionCode: true, code: true, label: true, value1: true, value2: true },
      }),
      this.prisma.enadManualAnswer.findMany({
        where: { surveyId: survey.id, questionCode: { in: [10, 11] } },
        select: { questionCode: true, selectedOptionCodes: true, answerText: true },
      }),
      this.prisma.asset.groupBy({
        by: ['assetType'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);

    const byCode = new Map(items.map((i) => [i.code, i]));
    const manualByQ = new Map(manualAnswers.map((a) => [a.questionCode, a]));

    const selectedLabel = (questionCode: number) => {
      const code = manualByQ.get(questionCode)?.selectedOptionCodes?.[0] ?? null;
      if (!code) return { code: null, label: null };
      const option = byCode.get(code);
      return { code, label: option?.label ?? null };
    };

    const sum2 = (questionCode: number) => {
      let v1 = 0;
      let v2 = 0;
      for (const it of items) {
        if (it.questionCode !== questionCode) continue;
        v1 += decToNumber(it.value1);
        v2 += decToNumber(it.value2);
      }
      return { value1: v1, value2: v2, total: v1 + v2 };
    };

    const sum1 = (questionCode: number) => {
      let v = 0;
      for (const it of items) {
        if (it.questionCode !== questionCode) continue;
        v += decToNumber(it.value1);
      }
      return v;
    };

    const getQ20 = (prefix: string) => {
      const inUse = decToNumber(byCode.get(`${prefix}.in_use`)?.value1);
      const avgAge = decToNumber(byCode.get(`${prefix}.avg_age_years`)?.value1);
      const noUse = decToNumber(byCode.get(`${prefix}.no_use`)?.value1);
      const notOperational = decToNumber(byCode.get(`${prefix}.not_operational`)?.value1);
      return { inUse, avgAgeYears: avgAge, noUse, notOperational };
    };

    const desktopsCpu = items
      .filter((i) => i.questionCode === 14 && i.value1 !== null)
      .map((i) => ({
        code: i.code,
        processor: i.label,
        windows: decToNumber(i.value1),
        linux: decToNumber(i.value2),
      }))
      .sort((a, b) => b.windows + b.linux - (a.windows + a.linux))
      .slice(0, 12);

    const laptopsCpu = items
      .filter((i) => i.questionCode === 16 && i.value1 !== null)
      .map((i) => ({
        code: i.code,
        processor: i.label,
        windows: decToNumber(i.value1),
        linux: decToNumber(i.value2),
      }))
      .sort((a, b) => b.windows + b.linux - (a.windows + a.linux))
      .slice(0, 12);

    return {
      available: true,
      survey,
      cmdb: {
        assetsByType: Object.fromEntries(assetsByType.map((r) => [r.assetType, r._count._all])),
      },
      institutional: {
        personnel: selectedLabel(10),
        telework: selectedLabel(11),
      },
      devices: {
        desktops: { ...sum2(14) },
        laptops: { ...sum2(16) },
        tabletsTotal: sum1(18),
      },
      availability: {
        desktops: getQ20('20.1'),
        laptops: getQ20('20.2'),
        tablets: getQ20('20.4'),
      },
      cpuTop: {
        desktops: desktopsCpu,
        laptops: laptopsCpu,
      },
    };
  }
}
