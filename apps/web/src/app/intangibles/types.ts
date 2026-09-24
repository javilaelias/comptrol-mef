export type BatchCut = {
  id: string;
  source: 'siga' | 'coordinator';
  cutDate: string;
  fileName: string | null;
  rowCount: number;
};

export type Cuts = {
  siga: BatchCut | null;
  coordinator: BatchCut | null;
  excelNewerThanSiga: boolean;
};

export type IntangibleItem = {
  code: string;
  inventory_code: string | null;
  description: string | null;
  brand: string | null;
  status: 'active' | 'retired' | null;
  po_number: number | null;
  po_year: number | null;
  siga_supplier: string | null;
  excel_supplier: string | null;
  registered_at: string | null;
  initial_value: number | null;
  org_unit: string | null;
  condition: string | null;
  expires_at: string | null;
  justification: string | null;
  hr: string | null;
  document: string | null;
  account_name: string | null;
  in_siga: boolean;
  in_excel: boolean;
  suspicious_account: boolean;
  expiry_bucket: 'expired' | 'expiring' | 'valid' | 'none';
};

export type IntangibleListResponse = {
  total: number;
  items: IntangibleItem[];
  expiringDays: number;
  cuts: Cuts;
};

export type ReconciliationSummary = {
  cuts: Cuts;
  counts: {
    onlySiga: { active: number; retired: number };
    onlyExcel: number;
    fieldDiffs: number;
    poCountsWithDifference: number;
    pending: { noCondition: number; definedNoExpiry: number };
    expiry: { expired: number; expiring: number; valid: number };
    noConditionSiga: { verified: number; unverified: number; noOrder: number; withEndOfLife: number };
    suspiciousAccount: number;
  };
};

export type ViewResponse = { total: number; items: Array<Record<string, unknown>> };

export type BatchItem = {
  id: string;
  source: 'siga' | 'coordinator';
  cutDate: string;
  fileName: string | null;
  rowCount: number;
  isCurrent: boolean;
  createdAt: string;
  discarded: number;
  warningCount: number;
  uploadedBy: { fullName: string; email: string } | null;
};

export type UploadResult = {
  id: string;
  cutDate: string;
  fileName: string;
  rowCount: number;
  discarded: number;
  warningCount: number;
  warnings: Array<{ row: number; reason: string }>;
};

export const SUSPICIOUS_ACCOUNT_TEXT = 'Posible error de cuenta: intangible registrado como mueble no depreciable';

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
