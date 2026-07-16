import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import xlsx from 'xlsx';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
// The importer shares the API Prisma schema, so it must use the client generated in apps/api.
import {
  Prisma,
  PrismaClient,
  AssetSource,
  AssetStatus,
  AssetType,
  UserRole,
  UserStatus,
} from '../../api/node_modules/@prisma/client';

function envFlag(name: string) {
  const v = (process.env[name] ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes';
}

function normalizeString(value: unknown) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const m = String(value).match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function inferAssetType(description: string | null): AssetType {
  const d = (description ?? '').toUpperCase();
  if (d.includes('PORTATIL') || d.includes('LAPTOP') || d.includes('NOTEBOOK')) return AssetType.laptop;
  if (d.includes('COMPUTADORA PERSONAL') && d.includes('PORTATIL')) return AssetType.laptop;
  if (d.includes('UNIDAD CENTRAL') || d.includes('CPU') || d.includes('COMPUTADORA PERSONAL')) return AssetType.desktop;
  if (d.includes('SERVIDOR')) return AssetType.server;
  if (d.includes('SWITCH') || d.includes('ROUTER') || d.includes('FIREWALL')) return AssetType.network;
  if (d.includes('TABLET')) return AssetType.mobile;
  return AssetType.other;
}

function mapConditionToStatus(conditionLabel: string | null): AssetStatus {
  const c = (conditionLabel ?? '').toUpperCase();
  if (c.includes('EN USO')) return AssetStatus.in_use;
  if (c.includes('SIN USO')) return AssetStatus.in_stock;
  return AssetStatus.in_stock;
}

function resolveDocsDir() {
  const explicit = String(process.env.DOCS_DIR ?? '').trim();
  if (explicit) return explicit;
  return path.resolve(process.cwd(), '..', '..', 'docs');
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const reset = envFlag('IMPORT_RESET');
  const asOfDate = new Date('2025-12-31');
  const docsDir = resolveDocsDir();

  const equiposPath = path.join(docsDir, 'EQUIPOS TECNOLOGICOS.xlsx');
  const licXlsxPath = path.join(docsDir, 'Relacion de Licencias y aplicativos MEF - 31 dic 2025.converted.xlsx');
  const licXlsPath = path.join(docsDir, 'Relacion de Licencias y aplicativos MEF - 31 dic 2025.xls');
  const licPath = fs.existsSync(licXlsxPath) ? licXlsxPath : licXlsPath;

  if (!fs.existsSync(equiposPath)) throw new Error(`Missing file: ${equiposPath}`);
  if (!fs.existsSync(licPath)) throw new Error(`Missing file: ${licPath}`);

  const tenant =
    (await prisma.tenant.findFirst({ where: { slug: 'mef' } })) ??
    (await prisma.tenant.create({ data: { name: 'Ministerio de EconomÃ­a y Finanzas', slug: 'mef' } }));

  const adminEmail = 'admin@mef.gob.pe';
  const adminPassword = 'Admin123!';
  const existingAdmin = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        fullName: 'Administrador MEF',
        role: UserRole.super_admin,
        status: UserStatus.active,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        mfaEnabled: false,
        ssoProvider: 'local',
      },
    });
  } else if (!existingAdmin.passwordHash) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { passwordHash: await bcrypt.hash(adminPassword, 10) },
    });
  }

  if (reset) {
    await prisma.licenseHolding.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.application.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.softwareLicense.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.asset.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.location.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.orgUnit.deleteMany({ where: { tenantId: tenant.id } });
  }

  const equiposWb = xlsx.readFile(equiposPath, { cellDates: true });
  const sheetName = equiposWb.SheetNames[0]!;
  const equiposSheet = equiposWb.Sheets[sheetName]!;
  const equiposRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(equiposSheet, { defval: null });

  const siteNames = new Set<string>();
  const orgUnitNames = new Set<string>();
  const locationKeyToData = new Map<string, { siteName: string; locationName: string }>();

  for (const row of equiposRows) {
    const siteName = normalizeString(row['SEDE'] ?? row['Sede'] ?? row['SEDE / UBICACION'] ?? row['SEDE/UBICACION']);
    const locationName = normalizeString(row['UBICACION'] ?? row['Ubicacion'] ?? row['UBICACION FISICA']);
    const orgUnit = normalizeString(row['DEPENDENCIA'] ?? row['Dependencia'] ?? row['UNIDAD ORGANICA']);

    if (siteName) siteNames.add(siteName);
    if (orgUnit) orgUnitNames.add(orgUnit);
    if (siteName && locationName) locationKeyToData.set(`${siteName}||${locationName}`, { siteName, locationName });
  }

  const existingSites = await prisma.site.findMany({ where: { tenantId: tenant.id } });
  const existingSiteByName = new Map(existingSites.map((s) => [s.name.toUpperCase(), s]));

  for (const name of siteNames) {
    const key = name.toUpperCase();
    if (existingSiteByName.has(key)) continue;
    const code = `SED-${key.replace(/[^A-Z0-9]+/g, '-').slice(0, 12)}`;
    const s = await prisma.site.create({
      data: { tenantId: tenant.id, name, code, country: 'PerÃº', city: null, addressLine1: null, isActive: true },
    });
    existingSiteByName.set(key, s);
  }

  const existingOrgUnits = await prisma.orgUnit.findMany({ where: { tenantId: tenant.id } });
  const existingOrgByName = new Map(existingOrgUnits.map((o) => [o.name.toUpperCase(), o]));
  for (const name of orgUnitNames) {
    const key = name.toUpperCase();
    if (existingOrgByName.has(key)) continue;
    const o = await prisma.orgUnit.create({ data: { tenantId: tenant.id, name } });
    existingOrgByName.set(key, o);
  }

  const existingLocations = await prisma.location.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, siteId: true } });
  const locationIndex = new Set(existingLocations.map((l) => `${l.siteId}||${l.name.toUpperCase()}`));

  for (const { siteName, locationName } of locationKeyToData.values()) {
    const site = existingSiteByName.get(siteName.toUpperCase());
    if (!site) continue;
    const key = `${site.id}||${locationName.toUpperCase()}`;
    if (locationIndex.has(key)) continue;
    const loc = await prisma.location.create({
      data: {
        tenantId: tenant.id,
        siteId: site.id,
        name: locationName,
        code: null,
        country: 'PerÃº',
        city: site.city ?? null,
        addressLine1: null,
        isActive: true,
      },
      select: { id: true, name: true, siteId: true },
    });
    locationIndex.add(`${loc.siteId}||${loc.name.toUpperCase()}`);
  }

  const sites = await prisma.site.findMany({ where: { tenantId: tenant.id } });
  const siteByName = new Map(sites.map((s) => [s.name.toUpperCase(), s]));
  const locations = await prisma.location.findMany({ where: { tenantId: tenant.id } });
  const locationBySiteName = new Map<string, Map<string, string>>();
  for (const l of locations) {
    const site = sites.find((s) => s.id === l.siteId);
    if (!site) continue;
    const siteKey = site.name.toUpperCase();
    const m = locationBySiteName.get(siteKey) ?? new Map<string, string>();
    m.set(l.name.toUpperCase(), l.id);
    locationBySiteName.set(siteKey, m);
  }
  const orgUnits = await prisma.orgUnit.findMany({ where: { tenantId: tenant.id } });
  const orgByName = new Map(orgUnits.map((o) => [o.name.toUpperCase(), o.id]));

  const sourceDocument = path.basename(equiposPath);
  const toCreate: Prisma.AssetCreateManyInput[] = [];
  for (const row of equiposRows) {
    const assetTag = normalizeString(row['ASSET TAG'] ?? row['Asset Tag'] ?? row['ASSET_TAG'] ?? row['SERIE']);
    if (!assetTag) continue;

    const description = normalizeString(row['DESCRIPCION'] ?? row['Descripcion'] ?? row['EQUIPO']);
    const serialNumber = normalizeString(row['SERIE'] ?? row['Serie'] ?? row['SERIAL']);
    const inventoryCode = normalizeString(row['CODIGO INVENTARIO'] ?? row['CODIGO'] ?? row['Inventario']);
    const vendor = normalizeString(row['MARCA'] ?? row['Marca']);
    const model = normalizeString(row['MODELO'] ?? row['Modelo']);
    const conditionLabel = normalizeString(row['CONDICION'] ?? row['Condicion'] ?? row['ESTADO']);

    const siteName = normalizeString(row['SEDE'] ?? row['Sede'] ?? row['SEDE / UBICACION'] ?? row['SEDE/UBICACION']);
    const locationName = normalizeString(row['UBICACION'] ?? row['Ubicacion'] ?? row['UBICACION FISICA']);
    const orgUnit = normalizeString(row['DEPENDENCIA'] ?? row['Dependencia'] ?? row['UNIDAD ORGANICA']);

    const site = siteName ? siteByName.get(siteName.toUpperCase()) : null;
    const locationId =
      site && locationName ? locationBySiteName.get(site.name.toUpperCase())?.get(locationName.toUpperCase()) ?? null : null;

    const orgUnitId = orgUnit ? orgByName.get(orgUnit.toUpperCase()) ?? null : null;
    const assetType = inferAssetType(description);
    const status = mapConditionToStatus(conditionLabel);

    toCreate.push({
      tenantId: tenant.id,
      assetTag,
      inventoryCode,
      description,
      serialNumber,
      vendor,
      model,
      assetType,
      status,
      conditionLabel,
      acquisitionYear: null,
      source: AssetSource.api_import,
      orgUnitId,
      locationId,
      updatedAt: new Date(),
    });
  }

  const chunkSize = 1000;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    await prisma.asset.createMany({ data: toCreate.slice(i, i + chunkSize), skipDuplicates: true });
  }

  const licWb = xlsx.readFile(licPath, { cellDates: true });
  const aplicacionesSheet = licWb.Sheets['Aplicaciones'] ?? licWb.Sheets['APLICACIONES'];
  if (aplicacionesSheet) {
    const rows = xlsx.utils.sheet_to_json<unknown[]>(aplicacionesSheet, { header: 1, defval: null });
    const dataRows = rows.slice(4);
    const apps: Prisma.ApplicationCreateManyInput[] = [];
    for (const row of dataRows) {
      const r = row as unknown[];
      const n = toInt(r[0]);
      if (!n) continue;
      const name = normalizeString(r[1]);
      if (!name) continue;
      apps.push({
        tenantId: tenant.id,
        name,
        objective: normalizeString(r[3]),
        ownerOrgUnit: normalizeString(r[4]),
        status: normalizeString(r[5]),
        lastUpdateYear: toInt(r[6]),
        sourceDocument: path.basename(licPath),
      });
    }
    if (apps.length) await prisma.application.createMany({ data: apps, skipDuplicates: true });
  }

  const hoja1Sheet = licWb.Sheets['Hoja1'] ?? licWb.Sheets['Licencias'];
  if (hoja1Sheet) {
    const rows = xlsx.utils.sheet_to_json<unknown[]>(hoja1Sheet, { header: 1, defval: null });

    let startIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = (rows[i] as unknown[]) ?? [];
      const joined = r.map((v) => String(v ?? '')).join('|').toUpperCase();
      if (joined.includes('UNIDAD EJECUTORA') && joined.includes('CANTIDAD')) {
        startIdx = i + 1;
        break;
      }
    }

    let category: string | null = null;
    const holdings: Prisma.LicenseHoldingCreateManyInput[] = [];
    for (const rawRow of rows.slice(startIdx)) {
      const row = rawRow as unknown[];
      const col0 = normalizeString(row[0]);
      const col1 = normalizeString(row[1]);
      const col2 = normalizeString(row[2]);
      const col3 = normalizeString(row[3]);

      if (col0 && !toInt(col0) && !col1 && !col2 && !col3) {
        category = col0;
        continue;
      }

      const n = toInt(row[0]);
      if (!n) continue;

      const executingUnit = normalizeString(row[1]);
      const softwareName = normalizeString(row[2]);
      const qtyText = normalizeString(row[3]);
      if (!softwareName) continue;

      holdings.push({
        tenantId: tenant.id,
        asOfDate,
        category,
        executingUnit,
        softwareName,
        quantityInt: toInt(qtyText),
        quantityText: qtyText,
        sourceSheet: hoja1Sheet === licWb.Sheets['Hoja1'] ? 'Hoja1' : 'Licencias',
      });
    }

    if (holdings.length) {
      const holdingChunk = 1000;
      for (let i = 0; i < holdings.length; i += holdingChunk) {
        await prisma.licenseHolding.createMany({ data: holdings.slice(i, i + holdingChunk) });
      }
    }
  }

  const totals = await prisma.licenseHolding.groupBy({
    by: ['softwareName'],
    where: { tenantId: tenant.id },
    _sum: { quantityInt: true },
  });

  const toUpsert = totals
    .map((t) => ({ softwareName: t.softwareName, total: t._sum.quantityInt ?? 0 }))
    .filter((t) => t.total > 0);

  if (reset) {
    await prisma.softwareLicense.deleteMany({ where: { tenantId: tenant.id } });
  }

  if (toUpsert.length) {
    const names = toUpsert.map((t) => t.softwareName.slice(0, 140));
    const nameChunk = 500;
    for (let i = 0; i < names.length; i += nameChunk) {
      await prisma.softwareLicense.deleteMany({
        where: { tenantId: tenant.id, softwareName: { in: names.slice(i, i + nameChunk) } },
      });
    }

    await prisma.softwareLicense.createMany({
      data: toUpsert.map((t) => ({
        tenantId: tenant.id,
        softwareName: t.softwareName.slice(0, 140),
        vendor: null,
        licenseType: 'per_device',
        totalSeats: t.total,
        assignedSeats: 0,
        activeAgents: 0,
        inactiveAgents: 0,
        unitCost: 0,
        autoRenew: false,
        status: 'active',
      })),
      skipDuplicates: true,
    });
  }

  const [assetCount, appCount, holdingCount] = await Promise.all([
    prisma.asset.count({ where: { tenantId: tenant.id } }),
    prisma.application.count({ where: { tenantId: tenant.id } }),
    prisma.licenseHolding.count({ where: { tenantId: tenant.id } }),
  ]);

  console.log(
    JSON.stringify(
      {
        tenant: tenant.slug,
        imported: {
          assets: assetCount,
          applications: appCount,
          licenseHoldings: holdingCount,
        },
        docs: {
          equipos: path.basename(equiposPath),
          licencias: path.basename(licPath),
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
