import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import xlsx from 'xlsx';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient, AssetSource, AssetType, AssetStatus, UserRole, UserStatus } from '@prisma/client';

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
  // When executed as `npm --workspace apps/api run ...` cwd is `apps/api`.
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
    (await prisma.tenant.create({ data: { name: 'Ministerio de Economía y Finanzas', slug: 'mef' } }));

  // Ensure an admin user exists for demo login.
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
    // NOTE: audit_logs is append-only, we do not delete it.
    await prisma.licenseHolding.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.application.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.softwareLicense.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.asset.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.location.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.orgUnit.deleteMany({ where: { tenantId: tenant.id } });
  }

  // -------- Equipos --------
  const equiposWb = xlsx.readFile(equiposPath, { cellDates: true });
  const sheetName = equiposWb.SheetNames[0]!;
  const equiposSheet = equiposWb.Sheets[sheetName]!;
  const equiposRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(equiposSheet, { defval: null });

  const siteNames = new Set<string>();
  const orgUnitNames = new Set<string>();
  const locationKeyToData = new Map<string, { name: string; siteName: string | null }>();

  for (const r of equiposRows) {
    const local = normalizeString(r['LOCAL']);
    const dependencia = normalizeString(r['DEPENDENCIA']);
    const ubicacion = normalizeString(r['UBICACIÓN FISICA'] ?? r['UBICACION FISICA']);

    if (local) siteNames.add(local);
    if (dependencia) orgUnitNames.add(dependencia);
    if (ubicacion) {
      locationKeyToData.set(ubicacion, { name: ubicacion, siteName: local });
    }
  }

  if (siteNames.size) {
    await prisma.site.createMany({
      data: Array.from(siteNames).map((name) => ({
        tenantId: tenant.id,
        name,
        country: 'Perú',
      })),
      skipDuplicates: true,
    });
  }

  if (orgUnitNames.size) {
    await prisma.orgUnit.createMany({
      data: Array.from(orgUnitNames).map((name) => ({
        tenantId: tenant.id,
        name,
      })),
      skipDuplicates: true,
    });
  }

  const sites = await prisma.site.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  const siteByName = new Map(sites.map((s) => [s.name, s.id]));

  if (locationKeyToData.size) {
    const locationCreate = Array.from(locationKeyToData.values()).map((l) => ({
      tenantId: tenant.id,
      siteId: l.siteName ? siteByName.get(l.siteName) ?? null : null,
      name: l.name,
      isActive: true,
    }));
    await prisma.location.createMany({ data: locationCreate, skipDuplicates: true });
  }

  const locations = await prisma.location.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
  });
  const locationByName = new Map(locations.map((l) => [l.name, l.id]));

  const orgUnits = await prisma.orgUnit.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  const orgUnitByName = new Map(orgUnits.map((o) => [o.name, o.id]));

  const assetsToCreate: Prisma.AssetCreateManyInput[] = [];
  for (const r of equiposRows) {
    const assetTag = normalizeString(r['COD PATRIMONIAL']);
    if (!assetTag) continue;

    const inventoryCode = normalizeString(r['COD INVENTARIO']);
    const description = normalizeString(r['DESCRIPCION DEL BIEN']);
    const vendor = normalizeString(r['MARCA']);
    const model = normalizeString(r['MODELO']);
    const serialNumber = normalizeString(r['SERIE']);
    const conditionLabel = normalizeString(r['CONDICION']);
    const acquisitionYear = toInt(r['AÑO DE ADQUISICION'] ?? r['AÑO DE ADQUISICIÓN'] ?? r['ANIO DE ADQUISICION']);
    const locationName = normalizeString(r['UBICACIÓN FISICA'] ?? r['UBICACION FISICA']);
    const orgUnitName = normalizeString(r['DEPENDENCIA']);

    const locationId = locationName ? (locationByName.get(locationName) ?? null) : null;
    const orgUnitId = orgUnitName ? (orgUnitByName.get(orgUnitName) ?? null) : null;

    assetsToCreate.push({
      tenantId: tenant.id,
      assetTag,
      inventoryCode,
      description,
      serialNumber,
      assetType: inferAssetType(description),
      vendor,
      model,
      status: mapConditionToStatus(conditionLabel),
      conditionLabel,
      acquisitionYear,
      locationId,
      orgUnitId,
      purchaseCost: 0,
      currentBookValue: 0,
      lastSeenAt: null,
      source: AssetSource.api_import,
      fingerprint: serialNumber ?? assetTag,
    });
  }

  // Chunked createMany (to avoid huge payloads)
  const chunkSize = 1000;
  for (let i = 0; i < assetsToCreate.length; i += chunkSize) {
    const chunk = assetsToCreate.slice(i, i + chunkSize);
    await prisma.asset.createMany({ data: chunk, skipDuplicates: true });
  }

  // -------- Aplicaciones + Licencias --------
  const licWb = xlsx.readFile(licPath, { cellDates: true });
  const sourceDocument = path.basename(licPath);

  // Make repeated imports idempotent (avoid duplicates when running without IMPORT_RESET).
  if (!reset) {
    await prisma.application.deleteMany({ where: { tenantId: tenant.id, sourceDocument } });
    await prisma.licenseHolding.deleteMany({
      where: {
        tenantId: tenant.id,
        asOfDate,
        sourceSheet: { in: ['Hoja1', 'Licencias'] },
      },
    });
  }

  const aplicacionesSheet = licWb.Sheets['Aplicaciones'];
  if (aplicacionesSheet) {
    const rows = xlsx.utils.sheet_to_json<any[]>(aplicacionesSheet, { header: 1, defval: null });
    // Header is at row 3 (1-based) in the converted file
    const dataRows = rows.slice(4); // start after helper row
    const apps: Prisma.ApplicationCreateManyInput[] = [];
    for (const row of dataRows) {
      const n = toInt(row[0]);
      if (!n) continue;
      const name = normalizeString(row[1]);
      if (!name) continue;
      apps.push({
        tenantId: tenant.id,
        name,
        objective: normalizeString(row[3]),
        ownerOrgUnit: normalizeString(row[4]),
        status: normalizeString(row[5]),
        lastUpdateYear: toInt(row[6]),
        sourceDocument,
      });
    }
    if (apps.length) await prisma.application.createMany({ data: apps, skipDuplicates: true });
  }

  const hoja1Sheet = licWb.Sheets['Hoja1'] ?? licWb.Sheets['Licencias'];
  if (hoja1Sheet) {
    const rows = xlsx.utils.sheet_to_json<any[]>(hoja1Sheet, { header: 1, defval: null });

    // Detect header row with columns: N° | Unidad Ejecutora Presupuestal | Tipos de Licencia de Software | Cantidad Total
    let startIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const r = rows[i] ?? [];
      const joined = r.map((v: any) => String(v ?? '')).join('|').toUpperCase();
      if (joined.includes('UNIDAD EJECUTORA') && joined.includes('CANTIDAD')) {
        startIdx = i + 1;
        break;
      }
    }

    let category: string | null = null;
    const holdings: Prisma.LicenseHoldingCreateManyInput[] = [];
    for (const row of rows.slice(startIdx)) {
      const col0 = normalizeString(row[0]);
      const col1 = normalizeString(row[1]);
      const col2 = normalizeString(row[2]);
      const col3 = normalizeString(row[3]);

      // Category row: first cell text, rest empty
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

  // Optional: materialize totals into software_licenses (for dashboard)
  const totals = await prisma.licenseHolding.groupBy({
    by: ['softwareName'],
    where: { tenantId: tenant.id },
    _sum: { quantityInt: true },
  });

  const toUpsert = totals
    .map((t) => ({ softwareName: t.softwareName, total: t._sum.quantityInt ?? 0 }))
    .filter((t) => t.total > 0);

  if (reset) {
    // Recreate software_licenses from holdings totals (simplified)
    await prisma.softwareLicense.deleteMany({ where: { tenantId: tenant.id } });
  }

  if (toUpsert.length) {
    // Keep the materialized totals stable across repeated imports.
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
