import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as ExcelJS from 'exceljs';
import {
  CoordinatorExcelError,
  MAX_ROWS,
  normalizeCondition,
  parseCoordinatorExcel,
} from './coordinator-excel.parser';

const REAL_FILE = path.resolve(
  __dirname,
  '../../../../../docs/INTANGIBLES AL 30.06 (version 1)_22092023.xlsx',
);

async function buildXlsx(
  rows: unknown[][],
  sheetName = 'margesi',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADERS = [
  'ITEM',
  'COD PATRIMONIAL',
  'DESCRIPCION DEL BIEN',
  'NRO DE OC',
  'FECHA DE ALTA',
  'FECHA DE VENCIMIENTO',
  'CONDICION ',
];

describe('parseCoordinatorExcel', () => {
  it('unifica las variantes de escritura de la condición', () => {
    expect(normalizeCondition('Vida Util Indefinida ')).toBe(
      'VIDA ÚTIL INDEFINIDA',
    );
    expect(normalizeCondition('VIDA UTIL INDEFINIDA')).toBe(
      'VIDA ÚTIL INDEFINIDA',
    );
    expect(normalizeCondition('Vida Util Definida')).toBe('VIDA ÚTIL DEFINIDA');
    expect(normalizeCondition('  ')).toBeNull();
  });

  it('lee filas válidas, trata OC 0 como vacía y reporta repetidos, sin código y fechas ilegibles', async () => {
    const buf = await buildXlsx([
      ['basura de encabezado'],
      HEADERS,
      [
        1,
        '140400030001',
        'SOFTWARE A',
        553,
        new Date(Date.UTC(2013, 11, 26)),
        null,
        'Vida Util Definida ',
      ],
      [
        2,
        '140400030002',
        'SOFTWARE B',
        0,
        new Date(Date.UTC(2014, 0, 2)),
        'no es fecha',
        'VIDA UTIL INDEFINIDA',
      ],
      [3, '140400030001', 'REPETIDO', 1, null, null, null],
      [4, null, 'SIN CODIGO', 1, null, null, null],
    ]);
    const r = await parseCoordinatorExcel(buf);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      patrimonialCode: '140400030001',
      poNumber: 553,
      poYear: 2013,
      conditionNorm: 'VIDA ÚTIL DEFINIDA',
    });
    expect(r.rows[1]).toMatchObject({
      poNumber: null,
      poYear: null,
      expiresAt: null,
      conditionNorm: 'VIDA ÚTIL INDEFINIDA',
    });
    expect(r.rows[0].raw['COD PATRIMONIAL']).toBe('140400030001');
    expect(r.discarded).toBe(2);
    expect(r.warnings).toHaveLength(3);
  });

  it('ignora hojas sin el formato y usa la que tiene los encabezados', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Hoja1').addRow(['Etiquetas de fila', 'Cuenta']);
    const ws = wb.addWorksheet('margesi al 14');
    ws.addRow(HEADERS);
    ws.addRow([1, '140400030009', 'X', null, null, null, null]);
    const r = await parseCoordinatorExcel(
      Buffer.from(await wb.xlsx.writeBuffer()),
    );
    expect(r.rows.map((x) => x.patrimonialCode)).toEqual(['140400030009']);
  });

  it('rechaza el archivo e indica las columnas obligatorias que faltan', async () => {
    const buf = await buildXlsx([
      ['COD PATRIMONIAL', 'DESCRIPCION DEL BIEN'],
      ['1', 'x'],
    ]);
    await expect(parseCoordinatorExcel(buf)).rejects.toThrow(
      CoordinatorExcelError,
    );
    await expect(parseCoordinatorExcel(buf)).rejects.toMatchObject({
      missingColumns: ['CONDICION', 'FECHA DE VENCIMIENTO'],
    });
  });

  it('rechaza un archivo que no es xlsx', async () => {
    await expect(
      parseCoordinatorExcel(Buffer.from('no soy un zip')),
    ).rejects.toThrow();
  });

  it('aborta si la hoja supera el tope de filas', async () => {
    const rows: unknown[][] = [HEADERS];
    for (let i = 0; i <= MAX_ROWS; i++)
      rows.push([i, `C${i}`, 'x', null, null, null, null]);
    await expect(parseCoordinatorExcel(await buildXlsx(rows))).rejects.toThrow(
      /más de/,
    );
  }, 60_000);

  (existsSync(REAL_FILE) ? it : it.skip)(
    'lee el Excel real del 30/06/2026 con los conteos verificados',
    async () => {
      const r = await parseCoordinatorExcel(readFileSync(REAL_FILE));
      expect(r.rows).toHaveLength(9986);
      expect(r.headers).toHaveLength(25);
      const count = (f: (x: (typeof r.rows)[number]) => boolean) =>
        r.rows.filter(f).length;
      expect(count((x) => !x.conditionNorm)).toBe(932);
      expect(
        count((x) => x.conditionNorm === 'VIDA ÚTIL DEFINIDA' && !x.expiresAt),
      ).toBe(2241);
      expect(count((x) => !!x.expiresAt)).toBe(2693);
      // 12 filas traen la condición escrita en la columna de vencimiento ("Vidal Util indefinida").
      expect(
        r.warnings.filter((w) => /VENCIMIENTO ilegible/.test(w.reason)),
      ).toHaveLength(12);
      expect(
        count((x) =>
          /^MUEBLES Y ENSERES NO DEPRECIABLE/.test(x.accountName ?? ''),
        ),
      ).toBe(2000);
    },
    60_000,
  );
});
