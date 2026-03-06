import {
  AssetCriticality,
  AssetSource,
  AssetStatus,
  AssetType,
  LicenseStatus,
  LicenseType,
  PrismaClient,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for seeding.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function main() {
  const reset = process.env.SEED_RESET === "1" || process.env.SEED_RESET === "true";

  const tenant =
    (await prisma.tenant.findFirst({ where: { slug: "mef" } })) ??
    (await prisma.tenant.create({
      data: {
        name: "Ministerio de Economía y Finanzas",
        slug: "mef",
      },
    }));

  if (reset) {
    // NOTE: audit_logs is append-only (no DELETE). Keep it for demo safety.
    await prisma.licenseHolding.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.application.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.asset.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.softwareLicense.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.location.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.site.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.orgUnit.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenant.id } });
  } else {
    const existingAssets = await prisma.asset.count({ where: { tenantId: tenant.id } });
    if (existingAssets > 0) {
      // Prevent accidental duplication.
      return;
    }
  }

  const sitesData = [
    { code: "SED-LIM", name: "Sede Central Lima", city: "Lima" },
    { code: "SED-ARE", name: "Sede Arequipa", city: "Arequipa" },
    { code: "SED-TRU", name: "Sede Trujillo", city: "Trujillo" },
    { code: "SED-PIU", name: "Sede Piura", city: "Piura" },
    { code: "SED-CUS", name: "Sede Cusco", city: "Cusco" },
    { code: "SED-CHI", name: "Sede Chiclayo", city: "Chiclayo" },
    { code: "SED-IQU", name: "Sede Iquitos", city: "Iquitos" },
    { code: "SED-HUA", name: "Sede Huancayo", city: "Huancayo" },
    { code: "SED-TAC", name: "Sede Tacna", city: "Tacna" },
    { code: "SED-PUC", name: "Sede Pucallpa", city: "Pucallpa" },
  ];

  await prisma.site.createMany({
    data: sitesData.map((s) => ({
      tenantId: tenant.id,
      code: s.code,
      name: s.name,
      country: "Perú",
      city: s.city,
      addressLine1: faker.location.streetAddress(),
      isActive: true,
    })),
  });
  const sites = await prisma.site.findMany({ where: { tenantId: tenant.id } });

  // 2000 locations nationwide
  const locationsToCreate = Array.from({ length: 2000 }).map((_, index) => {
    const n = index + 1;
    const site = pick(sites);
    return {
      tenantId: tenant.id,
      siteId: site.id,
      name: `Ubicación ${String(n).padStart(4, "0")}`,
      code: `LOC-${String(n).padStart(4, "0")}`,
      country: "Perú",
      city: site.city ?? "Lima",
      addressLine1: faker.location.streetAddress(),
      isActive: true,
    };
  });
  await prisma.location.createMany({ data: locationsToCreate });
  const locations = await prisma.location.findMany({ where: { tenantId: tenant.id }, select: { id: true, siteId: true } });

  const adminPassword = "Admin123!";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "admin@mef.gob.pe",
      fullName: "Administrador MEF",
      role: UserRole.super_admin,
      status: UserStatus.active,
      passwordHash,
      mfaEnabled: false,
      ssoProvider: "local",
    },
  });
  const itAdminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "itadmin@mef.gob.pe",
      fullName: "IT Admin",
      role: UserRole.it_admin,
      status: UserStatus.active,
      passwordHash: await bcrypt.hash("ItAdmin123!", 10),
      mfaEnabled: false,
      ssoProvider: "local",
    },
  });
  const assetManagerUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "asset.manager@mef.gob.pe",
      fullName: "Gestor de Activos",
      role: UserRole.asset_manager,
      status: UserStatus.active,
      passwordHash: await bcrypt.hash("Assets123!", 10),
      mfaEnabled: false,
      ssoProvider: "local",
    },
  });

  const users = [adminUser, itAdminUser, assetManagerUser];
  const ownerIds = users.map((u) => u.id);

  await prisma.softwareLicense.createMany({
    data: [
      {
        tenantId: tenant.id,
        softwareName: "Microsoft 365",
        vendor: "Microsoft",
        licenseType: LicenseType.subscription,
        totalSeats: 3500,
        assignedSeats: 3300,
        activeAgents: 3150,
        inactiveAgents: 150,
        unitCost: 45,
        status: LicenseStatus.active,
        autoRenew: true,
        renewalDate: faker.date.soon({ days: 120 }),
      },
      {
        tenantId: tenant.id,
        softwareName: "Antivirus EDR",
        vendor: "Vendor EDR",
        licenseType: LicenseType.per_device,
        totalSeats: 3200,
        assignedSeats: 3100,
        activeAgents: 3000,
        inactiveAgents: 100,
        unitCost: 18,
        status: LicenseStatus.active,
        autoRenew: true,
        renewalDate: faker.date.soon({ days: 90 }),
      },
      {
        tenantId: tenant.id,
        softwareName: "Adobe Acrobat",
        vendor: "Adobe",
        licenseType: LicenseType.subscription,
        totalSeats: 500,
        assignedSeats: 430,
        activeAgents: 350,
        inactiveAgents: 80,
        unitCost: 16,
        status: LicenseStatus.expiring,
        autoRenew: false,
        renewalDate: faker.date.soon({ days: 35 }),
      },
    ],
  });

  // 3000 PCs + some infra assets
  const totalAssets = 3200;
  const assetBatchSize = 400;

  for (let offset = 0; offset < totalAssets; offset += assetBatchSize) {
    const batchSize = Math.min(assetBatchSize, totalAssets - offset);
    const batch = Array.from({ length: batchSize }).map((_, index) => {
      const n = offset + index + 1;
      const isInfra = n % 40 === 0;
      const assetType = isInfra ? pick([AssetType.server, AssetType.network]) : AssetType.desktop;
      const status = n % 28 === 0 ? AssetStatus.retired : n % 33 === 0 ? AssetStatus.disposed : AssetStatus.in_use;
      const location = pick(locations);
      const purchaseCost = faker.number.int({ min: 1800, max: 5200 });
      const depreciationFactor = faker.number.float({ min: 0.15, max: 0.85, fractionDigits: 2 });
      const currentBookValue = Math.round(purchaseCost * depreciationFactor);
      const now = Date.now();
      const daysAgoSeen = clampInt(faker.number.int({ min: 0, max: 90 }), 0, 90);
      const lastSeenAt = status === AssetStatus.in_use ? new Date(now - daysAgoSeen * 24 * 60 * 60 * 1000) : null;

      const serialNumber = `SN-${String(n).padStart(6, "0")}`;
      const hostname = isInfra ? `SRV-${String(n).padStart(4, "0")}` : `PC-${String(n).padStart(4, "0")}`;
      const ipAddress = faker.internet.ipv4();
      const macAddress = faker.internet.mac();
      const fingerprint = serialNumber;

      const purchaseDate = faker.date.past({ years: 5 });
      const warrantyEndDate = faker.date.between({ from: purchaseDate, to: faker.date.soon({ days: 365 }) });

      return {
        tenantId: tenant.id,
        assetTag: `MEF-${String(n).padStart(6, "0")}`,
        serialNumber,
        hostname,
        ipAddress,
        macAddress,
        assetType,
        vendor: isInfra ? pick(["Dell", "HPE", "Cisco"]) : pick(["Dell", "HP", "Lenovo"]),
        model: isInfra ? pick(["PowerEdge", "ProLiant", "Catalyst"]) : pick(["OptiPlex", "EliteDesk", "ThinkCentre"]),
        operatingSystem: isInfra ? pick(["Windows Server 2019", "Ubuntu 22.04 LTS"]) : pick(["Windows 11", "Windows 10"]),
        status,
        criticality: isInfra
          ? pick([AssetCriticality.high, AssetCriticality.critical])
          : pick([AssetCriticality.low, AssetCriticality.medium, AssetCriticality.high]),
        ownerUserId: pick(ownerIds),
        locationId: location.id,
        purchaseDate,
        warrantyEndDate,
        depreciationEndDate: faker.date.soon({ days: 365 * 2 }),
        purchaseCost,
        currentBookValue,
        lastSeenAt,
        source: n % 7 === 0 ? AssetSource.discovery_active : AssetSource.manual,
        fingerprint,
      };
    });

    await prisma.asset.createMany({ data: batch });
  }

  // Add some audit events for demo (append-only)
  const someAssets = await prisma.asset.findMany({ take: 50, select: { id: true } });
  const actor = adminUser;
  await prisma.auditLog.createMany({
    data: someAssets.map((a) => ({
      tenantId: tenant.id,
      actorUserId: actor.id,
      entityType: "assets",
      entityId: a.id,
      action: "seed_create",
      afterData: { seeded: true },
      metadata: { source: "seed" },
    })),
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
