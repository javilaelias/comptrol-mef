import * as ExcelJS from 'exceljs';

/**
 * Lee el Excel de intangibles del coordinador de infraestructura (hoja "margesi al 14").
 *
 * La hoja se detecta por sus encabezados, no por su nombre: la primera hoja que tenga
 * COD PATRIMONIAL + DESCRIPCION DEL BIEN + CONDICION + FECHA DE VENCIMIENTO en alguna de sus
 * primeras filas. Se leen solo valores (sin evaluar fórmulas), con topes de tamaño descomprimido,
 * hojas y filas para no procesar archivos desproporcionados.
 */

export const MAX_ROWS = 50_000;
export const MAX_SHEETS = 20;
export const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const HEADER_SCAN_ROWS = 10;

const REQUIRED = [
  'COD PATRIMONIAL',
  'DESCRIPCION DEL BIEN',
  'CONDICION',
  'FECHA DE VENCIMIENTO',
];

export type CoordinatorRow = {
  rowNumber: number;
  patrimonialCode: string;
  inventoryCode: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  siteName: string | null;
  orgUnit: string | null;
  physicalLocation: string | null;
  accountCode: string | null;
  accountName: string | null;
  poNumber: number | null;
  poYear: number | null;
  document: string | null;
  hr: string | null;
  supplierName: string | null;
  registeredAt: Date | null;
  expiresAt: Date | null;
  initialValue: number | null;
  conditionRaw: string | null;
  conditionNorm: string | null;
  justification: string | null;
  /** Fila original con los encabezados tal como vienen en el Excel (para exportar de vuelta). */
  raw: Record<string, string | number | null>;
};

type TextField =
  | 'inventoryCode'
  | 'description'
  | 'brand'
  | 'model'
  | 'siteName'
  | 'orgUnit'
  | 'physicalLocation'
  | 'accountCode'
  | 'accountName'
  | 'document'
  | 'hr'
  | 'supplierName'
  | 'justification';

/** Columnas de texto: encabezado normalizado del Excel → campo y largo máximo (igual que la tabla). */
const TEXT_COLUMNS: Array<[header: string, field: TextField, max: number]> = [
  ['COD INVENTARIO', 'inventoryCode', 40],
  ['DESCRIPCION DEL BIEN', 'description', 2000],
  ['MARCA', 'brand', 120],
  ['MODELO', 'model', 120],
  ['LOCAL', 'siteName', 160],
  ['DEPENDENCIA', 'orgUnit', 250],
  ['UBICACION FISICA', 'physicalLocation', 300],
  ['CTA CONTABLE', 'accountCode', 30],
  ['DENOMINACION DE LA CTA CONTABLE', 'accountName', 160],
  ['DOCUMENTO', 'document', 2000],
  ['HR', 'hr', 2000],
  ['PROVEEDOR', 'supplierName', 250],
  ['JUSTIFICACION', 'justification', 4000],
];

export type ParseWarning = { row: number; reason: string };

export type ParseResult = {
  headers: string[];
  rows: CoordinatorRow[];
  warnings: ParseWarning[];
  discarded: number;
};

export class CoordinatorExcelError extends Error {
  constructor(
    message: string,
    readonly missingColumns: string[] = [],
  ) {
    super(message);
  }
}

export function normalizeKey(
  value: string | number | Date | null | undefined,
): string {
  const s = value instanceof Date ? value.toISOString() : `${value ?? ''}`;
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** "Vida Util Definida ", "VIDA UTIL DEFINIDA" → "VIDA ÚTIL DEFINIDA". */
export function normalizeCondition(value: string | null): string | null {
  if (!value) return null;
  const key = normalizeKey(value);
  if (!key) return null;
  if (key === 'VIDA UTIL DEFINIDA') return 'VIDA ÚTIL DEFINIDA';
  if (key === 'VIDA UTIL INDEFINIDA') return 'VIDA ÚTIL INDEFINIDA';
  return key.slice(0, 40);
}

type Plain = string | number | Date | null;

/** Valor "plano" de una celda de exceljs: texto enriquecido, hipervínculos y fórmulas → su valor. */
function cellValue(v: ExcelJS.CellValue): Plain {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'SI' : 'NO';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
  }
  return null;
}

function text(v: Plain, max: number): string | null {
  if (v === null) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : `${v}`)
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.slice(0, max) : null;
}

/** Fecha desde Date, número de serie de Excel o texto dd/mm/yyyy | yyyy-mm-dd. `undefined` = ilegible. */
function date(v: Plain): Date | null | undefined {
  if (v === null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v;
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000)
      return new Date(Math.round((v - 25569) * 86400000));
    return undefined;
  }
  const s = v.trim();
  if (!s || s === '-') return null;
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return undefined;
}

function num(v: Plain): number | null {
  if (v === null || v instanceof Date) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = Number(v.replace(/[,\s]/g, ''));
  return v.trim() && isFinite(n) ? n : null;
}

function rawValue(v: Plain): string | number | null {
  return v instanceof Date ? v.toISOString().slice(0, 10) : v;
}

/**
 * Suma el tamaño descomprimido que declara el directorio central del zip, sin descomprimir nada.
 * Sirve para rechazar "zip bombs" antes de cargar el libro en memoria.
 */
export function declaredUncompressedSize(buffer: Buffer): number {
  const invalid = () =>
    new CoordinatorExcelError('El archivo no es un Excel (.xlsx) válido.');
  let eocd = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 22 - 0xffff);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw invalid();
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw invalid();
    const size = buffer.readUInt32LE(offset + 24);
    if (size === 0xffffffff) return Number.POSITIVE_INFINITY; // ZIP64: demasiado grande para este uso
    total += size;
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return total;
}

export async function parseCoordinatorExcel(
  buffer: Buffer,
): Promise<ParseResult> {
  if (buffer.length < 22)
    throw new CoordinatorExcelError(
      'El archivo no es un Excel (.xlsx) válido.',
    );
  if (declaredUncompressedSize(buffer) > MAX_UNCOMPRESSED_BYTES) {
    throw new CoordinatorExcelError(
      'El archivo descomprimido es demasiado grande.',
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new CoordinatorExcelError(
      'El archivo no es un Excel (.xlsx) válido.',
    );
  }
  if (workbook.worksheets.length > MAX_SHEETS) {
    throw new CoordinatorExcelError(
      `El archivo tiene más de ${MAX_SHEETS} hojas.`,
    );
  }

  let lastMissing: string[] = REQUIRED;

  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount > MAX_ROWS) {
      throw new CoordinatorExcelError(
        `La hoja "${worksheet.name}" tiene más de ${MAX_ROWS.toLocaleString('es-PE')} filas.`,
      );
    }

    let headerRow = 0;
    let columns: Array<{ index: number; header: string; key: string }> = [];
    for (
      let n = 1;
      n <= Math.min(HEADER_SCAN_ROWS, worksheet.rowCount) && !headerRow;
      n++
    ) {
      const values = (worksheet.getRow(n).values as ExcelJS.CellValue[]) ?? [];
      const found = values
        .map((v, index) => ({
          index,
          header: String(cellValue(v) ?? '').trim(),
          key: normalizeKey(cellValue(v)),
        }))
        .filter((c) => c.key);
      const keys = new Set(found.map((c) => c.key));
      const missing = REQUIRED.filter((r) => !keys.has(r));
      if (missing.length < lastMissing.length) lastMissing = missing;
      if (!missing.length) {
        headerRow = n;
        columns = found;
      }
    }
    if (!headerRow) continue;

    const indexByKey = new Map(columns.map((c) => [c.key, c.index]));
    const rows: CoordinatorRow[] = [];
    const warnings: ParseWarning[] = [];
    const seen = new Set<string>();
    let discarded = 0;

    for (let n = headerRow + 1; n <= worksheet.rowCount; n++) {
      const values = (worksheet.getRow(n).values as ExcelJS.CellValue[]) ?? [];
      const get = (key: string): Plain => {
        const index = indexByKey.get(key);
        return index === undefined ? null : cellValue(values[index]);
      };
      const raw: Record<string, string | number | null> = {};
      for (const c of columns)
        raw[c.header] = rawValue(cellValue(values[c.index]));

      const codeValue = get('COD PATRIMONIAL');
      const code =
        typeof codeValue === 'number'
          ? String(Math.trunc(codeValue))
          : text(codeValue, 40);
      if (!code) {
        if (Object.values(raw).some((v) => v !== null && v !== '')) {
          discarded++;
          warnings.push({
            row: n,
            reason: 'Sin código patrimonial: fila descartada',
          });
        }
        continue;
      }
      if (seen.has(code)) {
        discarded++;
        warnings.push({
          row: n,
          reason: `Código ${code} repetido: se conserva la primera aparición`,
        });
        continue;
      }
      seen.add(code);

      const altaValue = get('FECHA DE ALTA');
      const vencValue = get('FECHA DE VENCIMIENTO');
      const registeredAt = date(altaValue);
      const expiresAt = date(vencValue);
      if (registeredAt === undefined) {
        warnings.push({
          row: n,
          reason: `FECHA DE ALTA ilegible ("${text(altaValue, 60)}"): se deja vacía`,
        });
      }
      if (expiresAt === undefined) {
        warnings.push({
          row: n,
          reason: `FECHA DE VENCIMIENTO ilegible ("${text(vencValue, 60)}"): se deja vacía`,
        });
      }

      const po = num(get('NRO DE OC'));
      const poNumber = po ? Math.trunc(po) : null; // 0 = sin OC
      const conditionRaw = text(get('CONDICION'), 120);

      const record: CoordinatorRow = {
        rowNumber: n,
        patrimonialCode: code,
        inventoryCode: null,
        description: null,
        brand: null,
        model: null,
        siteName: null,
        orgUnit: null,
        physicalLocation: null,
        accountCode: null,
        accountName: null,
        poNumber,
        poYear: poNumber && registeredAt ? registeredAt.getUTCFullYear() : null,
        document: null,
        hr: null,
        supplierName: null,
        registeredAt: registeredAt ?? null,
        expiresAt: expiresAt ?? null,
        initialValue: num(get('VALOR INICIAL')),
        conditionRaw,
        conditionNorm: normalizeCondition(conditionRaw),
        justification: null,
        raw,
      };
      for (const [header, field, max] of TEXT_COLUMNS)
        record[field] = text(get(header), max);
      rows.push(record);
    }

    return { headers: columns.map((c) => c.header), rows, warnings, discarded };
  }

  throw new CoordinatorExcelError(
    `No se encontró la hoja de intangibles. Faltan las columnas: ${lastMissing.join(', ')}.`,
    lastMissing,
  );
}
