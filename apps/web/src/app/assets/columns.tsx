import React from 'react';

export type AssetListItem = {
  id: string;
  assetTag: string;
  inventoryCode: string | null;
  description: string | null;
  serialNumber: string | null;
  hostname: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  assetType: string;
  vendor: string | null;
  model: string | null;
  operatingSystem: string | null;
  osVersion: string | null;
  cpuModel: string | null;
  cpuCores: number | null;
  cpuLogical: number | null;
  ramMb: number | null;
  storageGb: number | null;
  status: string;
  conditionLabel: string | null;
  criticality: string;
  purchaseDate: string | null;
  acquisitionYear: number | null;
  warrantyEndDate: string | null;
  depreciationEndDate: string | null;
  purchaseCost: string | number | null;
  currentBookValue: string | number | null;
  lastSeenAt: string | null;
  lastInventoryAt: string | null;
  source: string;
  fingerprint: string | null;
  createdAt: string;
  updatedAt: string;
  location?: { name: string; site?: { name: string } | null } | null;
  orgUnit?: { name: string } | null;
  owner?: { id: string; fullName: string; email: string } | null;
};

export type ColumnGroup =
  | 'Identificación'
  | 'Ubicación / Responsable'
  | 'Estado'
  | 'Compra y garantía'
  | 'Hardware'
  | 'Auditoría';

export type AssetColumn = {
  key: string;
  label: string;
  group: ColumnGroup;
  defaultVisible: boolean;
  render: (a: AssetListItem) => React.ReactNode;
};

function dash(value: React.ReactNode) {
  return value === null || value === undefined || value === '' ? '—' : value;
}

function money(value: string | number | null) {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-PE');
}

export const ASSET_COLUMNS: AssetColumn[] = [
  // Identificación
  { key: 'assetTag', label: 'Asset Tag', group: 'Identificación', defaultVisible: true, render: (a) => a.assetTag },
  { key: 'description', label: 'Descripción', group: 'Identificación', defaultVisible: true, render: (a) => dash(a.description) },
  { key: 'assetType', label: 'Tipo', group: 'Identificación', defaultVisible: true, render: (a) => a.assetType },
  { key: 'inventoryCode', label: 'Código inventario', group: 'Identificación', defaultVisible: false, render: (a) => dash(a.inventoryCode) },
  { key: 'serialNumber', label: 'N° de serie', group: 'Identificación', defaultVisible: false, render: (a) => dash(a.serialNumber) },
  { key: 'hostname', label: 'Hostname', group: 'Identificación', defaultVisible: false, render: (a) => dash(a.hostname) },
  { key: 'ipAddress', label: 'Dirección IP', group: 'Identificación', defaultVisible: false, render: (a) => dash(a.ipAddress) },
  { key: 'macAddress', label: 'Dirección MAC', group: 'Identificación', defaultVisible: false, render: (a) => dash(a.macAddress) },

  // Ubicación / Responsable
  {
    key: 'location',
    label: 'Sede / Ubicación',
    group: 'Ubicación / Responsable',
    defaultVisible: true,
    render: (a) => `${a.location?.site?.name ?? 'Sin sede'} / ${a.location?.name ?? 'Sin ubicación'}`,
  },
  { key: 'orgUnit', label: 'Dependencia', group: 'Ubicación / Responsable', defaultVisible: true, render: (a) => dash(a.orgUnit?.name) },
  { key: 'owner', label: 'Responsable', group: 'Ubicación / Responsable', defaultVisible: true, render: (a) => dash(a.owner?.fullName) },

  // Estado
  { key: 'status', label: 'Estado', group: 'Estado', defaultVisible: true, render: (a) => a.status },
  { key: 'conditionLabel', label: 'Condición', group: 'Estado', defaultVisible: false, render: (a) => dash(a.conditionLabel) },
  { key: 'criticality', label: 'Criticidad', group: 'Estado', defaultVisible: false, render: (a) => a.criticality },

  // Compra y garantía
  { key: 'vendor', label: 'Marca', group: 'Compra y garantía', defaultVisible: false, render: (a) => dash(a.vendor) },
  { key: 'model', label: 'Modelo', group: 'Compra y garantía', defaultVisible: false, render: (a) => dash(a.model) },
  { key: 'purchaseDate', label: 'Fecha de compra', group: 'Compra y garantía', defaultVisible: false, render: (a) => date(a.purchaseDate) },
  { key: 'acquisitionYear', label: 'Año adquisición', group: 'Compra y garantía', defaultVisible: false, render: (a) => dash(a.acquisitionYear) },
  { key: 'warrantyEndDate', label: 'Fin de garantía', group: 'Compra y garantía', defaultVisible: false, render: (a) => date(a.warrantyEndDate) },
  { key: 'depreciationEndDate', label: 'Fin de depreciación', group: 'Compra y garantía', defaultVisible: false, render: (a) => date(a.depreciationEndDate) },
  { key: 'purchaseCost', label: 'Costo de compra', group: 'Compra y garantía', defaultVisible: false, render: (a) => money(a.purchaseCost) },
  { key: 'currentBookValue', label: 'Valor en libros', group: 'Compra y garantía', defaultVisible: false, render: (a) => money(a.currentBookValue) },

  // Hardware
  { key: 'operatingSystem', label: 'Sistema operativo', group: 'Hardware', defaultVisible: false, render: (a) => dash(a.operatingSystem) },
  { key: 'osVersion', label: 'Versión SO', group: 'Hardware', defaultVisible: false, render: (a) => dash(a.osVersion) },
  { key: 'cpuModel', label: 'CPU', group: 'Hardware', defaultVisible: false, render: (a) => dash(a.cpuModel) },
  { key: 'cpuCores', label: 'Núcleos físicos', group: 'Hardware', defaultVisible: false, render: (a) => dash(a.cpuCores) },
  { key: 'cpuLogical', label: 'Núcleos lógicos', group: 'Hardware', defaultVisible: false, render: (a) => dash(a.cpuLogical) },
  { key: 'ramMb', label: 'RAM (MB)', group: 'Hardware', defaultVisible: false, render: (a) => dash(a.ramMb) },
  { key: 'storageGb', label: 'Almacenamiento (GB)', group: 'Hardware', defaultVisible: false, render: (a) => dash(a.storageGb) },

  // Auditoría
  { key: 'source', label: 'Origen', group: 'Auditoría', defaultVisible: false, render: (a) => a.source },
  { key: 'lastSeenAt', label: 'Última conexión', group: 'Auditoría', defaultVisible: false, render: (a) => date(a.lastSeenAt) },
  { key: 'lastInventoryAt', label: 'Último inventario', group: 'Auditoría', defaultVisible: false, render: (a) => date(a.lastInventoryAt) },
  { key: 'createdAt', label: 'Creado', group: 'Auditoría', defaultVisible: false, render: (a) => date(a.createdAt) },
  { key: 'updatedAt', label: 'Actualizado', group: 'Auditoría', defaultVisible: false, render: (a) => date(a.updatedAt) },
];

export const DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = Object.fromEntries(
  ASSET_COLUMNS.map((c) => [c.key, c.defaultVisible]),
);

export const COLUMN_GROUPS: ColumnGroup[] = [
  'Identificación',
  'Ubicación / Responsable',
  'Estado',
  'Compra y garantía',
  'Hardware',
  'Auditoría',
];

const STORAGE_KEY = 'comptrol.assets.columnVisibility.v1';

export function loadColumnVisibility(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_VISIBILITY };
    const parsed = JSON.parse(raw);
    // Merge con el default: una columna nueva agregada después queda con su default,
    // no desaparece ni rompe si el storage viejo no la conoce.
    return { ...DEFAULT_COLUMN_VISIBILITY, ...parsed };
  } catch {
    return { ...DEFAULT_COLUMN_VISIBILITY };
  }
}

export function saveColumnVisibility(value: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage no disponible (modo privado, storage bloqueado) — la preferencia
    // simplemente no persiste, no debe romper la pantalla.
  }
}
