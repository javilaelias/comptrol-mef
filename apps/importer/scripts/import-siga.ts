import path from 'node:path';
import { config as cargarEnv } from 'dotenv';
import { Client } from 'pg';

// Primero el .env propio (si existe) y luego el de la API, que ya trae DATABASE_URL.
cargarEnv();
cargarEnv({ path: path.resolve(__dirname, '..', '..', 'api', '.env') });

import { PrismaPg } from '@prisma/adapter-pg';
// El cliente se genera desde el esquema de la API (ver el script import:siga del package.json).
import {
  Prisma,
  PrismaClient,
  AssetSource,
  AssetStatus,
  AssetType,
  UserRole,
  UserStatus,
} from '@prisma/client';

/**
 * Importa el patrimonio de SIGA (PostgreSQL) hacia el inventario de Comptrol.
 *
 * Los activos se identifican por el codigo patrimonial (sig_patrimonio.codigo_activo),
 * que es el mismo valor que Comptrol usa como assetTag, asi que los que ya existen se
 * actualizan y los que faltan se crean.
 */

const SEC_EJEC_MEF = 46;
const TENANT_SLUG = 'mef';
const FINGERPRINT_PREFIX = 'siga:';

// Clases del catalogo SBN que corresponden a equipamiento de TI.
const CLASES_TI: Array<{ grupo: string; clase: string }> = [
  { grupo: '74', clase: '08' }, // OFICINA / COMPUTO
  { grupo: '95', clase: '22' }, // TELECOMUNICACIONES / EQUIPO DE TELECOMUNICACIONES
];

type FilaSiga = {
  sec_ejec: number;
  tipo_modalidad: number;
  secuencia: number;
  codigo_activo: string | null;
  codigo_barra: string | null;
  descripcion: string | null;
  nombre_item: string | null;
  caracteristicas: string | null;
  nro_serie: string | null;
  modelo: string | null;
  marca_nombre: string | null;
  estado: string | null;
  estado_actual: string | null;
  conservacion: string | null;
  centro_costo: string | null;
  nombre_depend: string | null;
  empleado_final: string | null;
  nombre_empleado: string | null;
  sede: number | null;
  sede_nombre: string | null;
  sede_direccion: string | null;
  tipo_ubicac: number | null;
  cod_ubicac: string | null;
  ubicac_fisica: string | null;
  fecha_compra: Date | null;
  fecha_alta: Date | null;
  fecha_garantia_fin: Date | null;
  fec_fin_vida: Date | null;
  valor_compra: string | null;
  valor_inicial: string | null;
  valor_deprec: string | null;
};

function envFlag(name: string, porDefecto: boolean) {
  const v = (process.env[name] ?? '').toLowerCase().trim();
  if (!v) return porDefecto;
  return v === '1' || v === 'true' || v === 'yes' || v === 'si';
}

function texto(value: unknown, maxLen?: number): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return maxLen ? s.slice(0, maxLen) : s;
}

/** SIGA usa marcadores como "S/S" o "ILEGIBLE" cuando el equipo no tiene serie legible. */
const SERIE_BASURA = /^(S\/?S|S\/?N|SN|SIN\s*(NRO\.?|NUMERO|N°)?\s*SERIE?|NO\s*TIENE|NINGUN[OA]?|N\/?A|ILEGIBLE|INACCESIBLE|NO\s*VISIBLE|NO\s*LEGIBLE|0+|-+|\.+|X+)$/i;

function serieValida(value: unknown): string | null {
  const s = texto(value, 120);
  if (!s) return null;
  if (s.length < 3) return null;
  if (SERIE_BASURA.test(s)) return null;
  return s;
}

function inferirTipo(descripcion: string | null, nombreItem: string | null): AssetType {
  const d = `${descripcion ?? ''} ${nombreItem ?? ''}`.toUpperCase();
  if (/PORTATIL|LAPTOP|NOTEBOOK/.test(d)) return AssetType.laptop;
  if (/SERVIDOR|SERVER/.test(d)) return AssetType.server;
  if (/SWITCH|ROUTER|FIREWALL|ACCESS POINT|PUNTO DE ACCESO|MODEM|CONMUTADOR|RACK|BALANCEADOR|LOAD BALANC|GATEWAY|PATCH PANEL/.test(d))
    return AssetType.network;
  // Los telefonos fijos e IP no son moviles: caen en "other" junto con el resto de perifericos.
  if (/TABLET|CELULAR|SMARTPHONE|TELEFONO MOVIL|IPAD/.test(d)) return AssetType.mobile;
  if (/UNIDAD CENTRAL|CPU|COMPUTADORA PERSONAL|ESTACION DE TRABAJO|MICROCOMPUTADOR|MONITOR CON PROCESADOR/.test(d))
    return AssetType.desktop;
  return AssetType.other;
}

function mapearEstado(estado: string | null, estadoActual: string | null): AssetStatus {
  if (estado === '2') return AssetStatus.retired; // dado de baja
  if (estadoActual === 'S') return AssetStatus.in_use;
  return AssetStatus.in_stock;
}

function decimal(value: string | null): Prisma.Decimal {
  if (!value) return new Prisma.Decimal(0);
  const n = new Prisma.Decimal(value);
  return n.isNegative() ? new Prisma.Decimal(0) : n.toDecimalPlaces(2);
}

function anio(...fechas: Array<Date | null>): number | null {
  for (const f of fechas) if (f) return f.getFullYear();
  return null;
}

/**
 * Clave para reconocer el mismo nombre escrito distinto: SIGA escribe "DIRECCION" y el Excel
 * "DIRECCIÓN", o mete espacios de más. Ignora tildes, mayúsculas, espacios y signos.
 */
function claveNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Sufijo que la primera version del importador le puso a las ubicaciones repetidas, ej. "DEPOSITO [101-015]".
const SUFIJO_CODIGO = /\s*\[[^\]]+\]$/;

function construirConsulta(soloTi: boolean, incluirBajas: boolean, limite: number | null) {
  const filtros: string[] = [`p.sec_ejec = ${SEC_EJEC_MEF}`];
  if (soloTi) {
    const clases = CLASES_TI.map((c) => `(p.grupo_bien = '${c.grupo}' AND p.clase_bien = '${c.clase}')`).join(' OR ');
    filtros.push(`(${clases})`);
  }
  if (!incluirBajas) filtros.push(`p.estado <> '2'`);

  return `
    SELECT p.sec_ejec, p.tipo_modalidad, p.secuencia,
           p.codigo_activo, p.codigo_barra, p.descripcion, p.caracteristicas,
           c.nombre_item, p.nro_serie, p.modelo, mk.nombre AS marca_nombre,
           p.estado, p.estado_actual, me.descripcion AS conservacion,
           p.centro_costo, cc.nombre_depend,
           p.empleado_final,
           COALESCE(NULLIF(TRIM(pe.nombre_completo), ''),
                    NULLIF(TRIM(CONCAT_WS(' ', pe.nombres, pe.apellido_paterno, pe.apellido_materno)), '')) AS nombre_empleado,
           p.sede, sd.nombre AS sede_nombre, sd.direccion AS sede_direccion,
           p.tipo_ubicac, p.cod_ubicac, ub.ubicac_fisica,
           p.fecha_compra, p.fecha_alta, p.fecha_garantia_fin, p.fec_fin_vida,
           p.valor_compra, p.valor_inicial, p.valor_deprec
      FROM sig_patrimonio p
      LEFT JOIN catalogo_bien_serv c
             ON c.sec_ejec = p.sec_ejec AND c.tipo_bien = p.tipo_bien AND c.grupo_bien = p.grupo_bien
            AND c.clase_bien = p.clase_bien AND c.familia_bien = p.familia_bien AND c.item_bien = p.item_bien
      LEFT JOIN LATERAL (
             SELECT m.nombre FROM marca m
              WHERE m.marca = p.marca
              ORDER BY (m.tipo_marca = p.tipo_marca) DESC NULLS LAST
              LIMIT 1) mk ON TRUE
      LEFT JOIN mp_estado me ON me.estado_conserv = p.estado_conserv
      LEFT JOIN LATERAL (
             SELECT s.nombre_depend FROM sig_centro_costo s
              WHERE s.sec_ejec = p.sec_ejec AND s.centro_costo = p.centro_costo
              ORDER BY s.ano_eje DESC
              LIMIT 1) cc ON TRUE
      LEFT JOIN sig_personal pe ON pe.sec_ejec = p.sec_ejec AND pe.empleado = p.empleado_final
      LEFT JOIN tmp_sede sd ON sd.sec_ejec = p.sec_ejec AND sd.sede_id = p.sede
      LEFT JOIN sig_ubicac_fisica ub ON ub.tipo_ubicac = p.tipo_ubicac AND ub.cod_ubicac = p.cod_ubicac
     WHERE ${filtros.join(' AND ')}
     ORDER BY p.codigo_activo NULLS LAST, p.secuencia
     ${limite ? `LIMIT ${limite}` : ''}`;
}

async function main() {
  const comptrolUrl = process.env.DATABASE_URL;
  const sigaUrl = process.env.SIGA_DATABASE_URL;
  if (!comptrolUrl) throw new Error('Falta DATABASE_URL (base de Comptrol)');
  if (!sigaUrl) throw new Error('Falta SIGA_DATABASE_URL (base con el dump de SIGA)');

  const soloTi = envFlag('SIGA_SOLO_TI', true);
  const incluirBajas = envFlag('SIGA_INCLUIR_BAJAS', true);
  const crearUsuarios = envFlag('SIGA_CREAR_USUARIOS', true);
  const dryRun = envFlag('SIGA_DRY_RUN', false);
  const limite = Number(process.env.SIGA_LIMIT ?? '') || null;

  console.log(
    `Opciones: soloTi=${soloTi} incluirBajas=${incluirBajas} crearUsuarios=${crearUsuarios} dryRun=${dryRun}` +
      (limite ? ` limite=${limite}` : ''),
  );

  const siga = new Client({ connectionString: sigaUrl });
  await siga.connect();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: comptrolUrl }) });

  try {
    const { rows } = await siga.query<FilaSiga>(construirConsulta(soloTi, incluirBajas, limite));
    console.log(`SIGA: ${rows.length} bienes patrimoniales leidos`);
    if (!rows.length) return;

    const tenant =
      (await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } })) ??
      (await prisma.tenant.create({ data: { name: 'Ministerio de Economía y Finanzas', slug: TENANT_SLUG } }));

    // ---------- Sedes ----------
    const sedes = new Map<number, { nombre: string; direccion: string | null }>();
    for (const r of rows) {
      if (r.sede === null) continue;
      if (!sedes.has(r.sede)) {
        sedes.set(r.sede, {
          nombre: texto(r.sede_nombre, 120) ?? `SEDE ${r.sede}`,
          direccion: texto(r.sede_direccion, 160),
        });
      }
    }

    const sitesExistentes = await prisma.site.findMany({ where: { tenantId: tenant.id } });
    const siteIdPorSede = new Map<number, string>();
    let sitesCreados = 0;
    for (const [sede, datos] of sedes) {
      const existente = sitesExistentes.find((s) => s.name.toUpperCase() === datos.nombre.toUpperCase());
      if (existente) {
        siteIdPorSede.set(sede, existente.id);
        continue;
      }
      if (dryRun) continue;
      const creado = await prisma.site.create({
        data: {
          tenantId: tenant.id,
          name: datos.nombre,
          code: `SIGA-SED-${sede}`,
          country: 'Perú',
          city: 'Lima',
          addressLine1: datos.direccion,
          isActive: true,
        },
      });
      siteIdPorSede.set(sede, creado.id);
      sitesCreados++;
    }

    // ---------- Dependencias (centros de costo) ----------
    const dependencias = new Map<string, string>(); // centro_costo -> nombre
    for (const r of rows) {
      const cc = texto(r.centro_costo, 15);
      const nombre = texto(r.nombre_depend, 200);
      if (cc && nombre && !dependencias.has(cc)) dependencias.set(cc, nombre);
    }

    // Si el nombre ya existe (aunque cambien tildes o espacios) se reutiliza la dependencia mas antigua.
    const orgExistentes = await prisma.orgUnit.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'asc' } });
    const orgPorClave = new Map<string, string>();
    for (const o of orgExistentes) if (!orgPorClave.has(claveNombre(o.name))) orgPorClave.set(claveNombre(o.name), o.id);
    const orgIdPorCentroCosto = new Map<string, string>();
    let orgCreadas = 0;
    for (const [cc, nombre] of dependencias) {
      const clave = claveNombre(nombre);
      let id = orgPorClave.get(clave);
      if (!id && !dryRun) {
        const creada = await prisma.orgUnit.create({ data: { tenantId: tenant.id, name: nombre } });
        id = creada.id;
        orgPorClave.set(clave, id);
        orgCreadas++;
      }
      if (id) orgIdPorCentroCosto.set(cc, id);
    }

    // ---------- Ubicaciones fisicas ----------
    // Location tiene nombre unico por tenant, asi que los nombres repetidos llevan el codigo SIGA.
    const ubicaciones = new Map<string, { nombre: string; sede: number | null }>();
    for (const r of rows) {
      if (r.tipo_ubicac === null || !r.cod_ubicac) continue;
      const clave = `${r.tipo_ubicac}-${r.cod_ubicac}`;
      if (ubicaciones.has(clave)) continue;
      const nombre = texto(r.ubicac_fisica, 100);
      if (!nombre) continue;
      ubicaciones.set(clave, { nombre, sede: r.sede });
    }

    // Igual que las dependencias: una ubicacion con el mismo nombre (la mas antigua) se reutiliza.
    const locExistentes = await prisma.location.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'asc' } });
    const nombresLocUsados = new Set(locExistentes.map((l) => l.name.toUpperCase()));
    const locPorCodigo = new Map(locExistentes.filter((l) => l.code).map((l) => [l.code as string, l.id]));
    const locPorNombre = new Map<string, string>();
    for (const l of locExistentes) {
      const k = claveNombre(l.name.replace(SUFIJO_CODIGO, ''));
      if (!locPorNombre.has(k)) locPorNombre.set(k, l.id);
    }
    const locIdPorClave = new Map<string, string>();
    let locCreadas = 0;
    for (const [clave, datos] of ubicaciones) {
      const code = `SIGA-${clave}`;
      const yaExiste = locPorNombre.get(claveNombre(datos.nombre)) ?? locPorCodigo.get(code);
      if (yaExiste) {
        locIdPorClave.set(clave, yaExiste);
        continue;
      }
      if (nombresLocUsados.has(datos.nombre.toUpperCase())) continue; // no deberia pasar: el nombre ya se reconocio arriba
      if (dryRun) continue;
      const creada = await prisma.location.create({
        data: {
          tenantId: tenant.id,
          siteId: datos.sede !== null ? siteIdPorSede.get(datos.sede) ?? null : null,
          name: datos.nombre,
          code,
          country: 'Perú',
          city: 'Lima',
          isActive: true,
        },
      });
      nombresLocUsados.add(datos.nombre.toUpperCase());
      locPorNombre.set(claveNombre(datos.nombre), creada.id);
      locIdPorClave.set(clave, creada.id);
      locCreadas++;
    }

    // ---------- Responsables ----------
    const empleados = new Map<string, string>(); // codigo -> nombre
    if (crearUsuarios) {
      for (const r of rows) {
        const cod = texto(r.empleado_final, 15);
        const nombre = texto(r.nombre_empleado, 140);
        if (cod && nombre && !empleados.has(cod)) empleados.set(cod, nombre);
      }
    }

    const usuariosExistentes = await prisma.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, email: true },
    });
    const userIdPorEmail = new Map(usuariosExistentes.map((u) => [u.email.toLowerCase(), u.id]));
    const userIdPorEmpleado = new Map<string, string>();
    let usuariosCreados = 0;
    for (const [cod, nombre] of empleados) {
      const email = `siga-${cod.toLowerCase()}@siga.local`;
      let id = userIdPorEmail.get(email);
      if (!id && !dryRun) {
        const creado = await prisma.user.create({
          data: {
            tenantId: tenant.id,
            email,
            fullName: nombre,
            role: UserRole.employee,
            status: UserStatus.inactive, // solo sirve como responsable, no puede iniciar sesion
            ssoProvider: 'siga',
          },
          select: { id: true },
        });
        id = creado.id;
        userIdPorEmail.set(email, id);
        usuariosCreados++;
      }
      if (id) userIdPorEmpleado.set(cod, id);
    }

    // ---------- Activos ----------
    const existentes = await prisma.asset.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, assetTag: true, serialNumber: true },
    });
    const assetTagExistente = new Set(existentes.map((a) => a.assetTag));
    const duenoDeSerie = new Map<string, string>(); // serie -> assetTag
    for (const a of existentes) if (a.serialNumber) duenoDeSerie.set(a.serialNumber.toUpperCase(), a.assetTag);

    const etiquetasUsadas = new Set<string>();
    let seriesDescartadas = 0;
    let sinCodigo = 0;

    const preparados = rows.map((r) => {
      const codigo = texto(r.codigo_activo, 80);
      let assetTag = codigo ?? `SIGA-${r.tipo_modalidad}-${r.secuencia}`;
      if (!codigo) sinCodigo++;
      if (etiquetasUsadas.has(assetTag)) assetTag = `${assetTag}-${r.secuencia}`;
      etiquetasUsadas.add(assetTag);

      let serie = serieValida(r.nro_serie);
      if (serie) {
        const dueno = duenoDeSerie.get(serie.toUpperCase());
        if (dueno && dueno !== assetTag) {
          serie = null; // la serie ya pertenece a otro activo
          seriesDescartadas++;
        } else {
          duenoDeSerie.set(serie.toUpperCase(), assetTag);
        }
      }

      const descripcion = texto(r.descripcion, 2000) ?? texto(r.nombre_item, 2000);
      const claveUbicac = r.tipo_ubicac !== null && r.cod_ubicac ? `${r.tipo_ubicac}-${r.cod_ubicac}` : null;
      const centroCosto = texto(r.centro_costo, 15);
      const empleado = texto(r.empleado_final, 15);
      const valorInicial = decimal(r.valor_inicial);
      const depreciado = decimal(r.valor_deprec);
      const valorLibro = valorInicial.minus(depreciado);

      return {
        assetTag,
        datos: {
          inventoryCode: texto(r.codigo_barra, 40) ?? texto(r.codigo_activo, 40),
          description: descripcion,
          serialNumber: serie,
          assetType: inferirTipo(descripcion, r.nombre_item),
          vendor: texto(r.marca_nombre, 80),
          model: texto(r.modelo, 120),
          status: mapearEstado(r.estado, r.estado_actual),
          conditionLabel: texto(r.conservacion, 40),
          purchaseDate: r.fecha_compra,
          acquisitionYear: anio(r.fecha_compra, r.fecha_alta),
          warrantyEndDate: r.fecha_garantia_fin,
          depreciationEndDate: r.fec_fin_vida,
          purchaseCost: decimal(r.valor_compra),
          currentBookValue: valorLibro.isNegative() ? new Prisma.Decimal(0) : valorLibro,
          orgUnitId: centroCosto ? orgIdPorCentroCosto.get(centroCosto) ?? null : null,
          locationId: claveUbicac ? locIdPorClave.get(claveUbicac) ?? null : null,
          ownerUserId: empleado ? userIdPorEmpleado.get(empleado) ?? null : null,
          source: AssetSource.api_import,
          fingerprint: `${FINGERPRINT_PREFIX}${r.sec_ejec}-${r.tipo_modalidad}-${r.secuencia}`,
        },
      };
    });

    const nuevos = preparados.filter((p) => !assetTagExistente.has(p.assetTag)).length;
    const actualizados = preparados.length - nuevos;

    if (dryRun) {
      console.log('\n--- SIMULACION, no se escribio nada ---');
      console.log(`Sedes detectadas: ${sedes.size}`);
      console.log(`Dependencias detectadas: ${dependencias.size}`);
      console.log(`Ubicaciones detectadas: ${ubicaciones.size}`);
      console.log(`Responsables detectados: ${empleados.size}`);
      console.log(`Activos a crear: ${nuevos}, a actualizar: ${actualizados}`);
      console.log(`Series descartadas por duplicado: ${seriesDescartadas}, bienes sin codigo patrimonial: ${sinCodigo}`);
      console.log('\nEjemplos:');
      console.table(
        preparados.slice(0, 5).map((p) => ({
          assetTag: p.assetTag,
          tipo: p.datos.assetType,
          estado: p.datos.status,
          marca: p.datos.vendor,
          serie: p.datos.serialNumber,
          descripcion: (p.datos.description ?? '').slice(0, 45),
        })),
      );
      return;
    }

    const lote = 500;
    let procesados = 0;
    for (let i = 0; i < preparados.length; i += lote) {
      const trozo = preparados.slice(i, i + lote);
      await prisma.$transaction(
        trozo.map((p) =>
          prisma.asset.upsert({
            where: { tenantId_assetTag: { tenantId: tenant.id, assetTag: p.assetTag } },
            create: { tenantId: tenant.id, assetTag: p.assetTag, ...p.datos, updatedAt: new Date() },
            update: { ...p.datos, updatedAt: new Date() },
          }),
        ),
      );
      procesados += trozo.length;
      if (procesados % 5000 === 0 || procesados === preparados.length) {
        console.log(`  activos procesados: ${procesados}/${preparados.length}`);
      }
    }

    // Limpieza: las dependencias y ubicaciones repetidas que ya no tienen equipos se eliminan.
    // La "canonica" es la mas antigua de cada nombre, la misma que eligio el emparejamiento de arriba.
    const orgs = await prisma.orgUnit.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, _count: { select: { assets: true } } },
    });
    const orgCanonica = new Map<string, string>();
    for (const o of orgs) if (!orgCanonica.has(claveNombre(o.name))) orgCanonica.set(claveNombre(o.name), o.id);
    const orgSobrantes = orgs
      .filter((o) => orgCanonica.get(claveNombre(o.name)) !== o.id && o._count.assets === 0)
      .map((o) => o.id);
    if (orgSobrantes.length) await prisma.orgUnit.deleteMany({ where: { id: { in: orgSobrantes } } });

    const locs = await prisma.location.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, code: true, _count: { select: { assets: true } } },
    });
    const locCanonica = new Map<string, string>();
    for (const l of locs) {
      const k = claveNombre(l.name.replace(SUFIJO_CODIGO, ''));
      if (!locCanonica.has(k)) locCanonica.set(k, l.id);
    }
    const locSobrantes = locs
      .filter(
        (l) =>
          l.code?.startsWith('SIGA-') &&
          locCanonica.get(claveNombre(l.name.replace(SUFIJO_CODIGO, ''))) !== l.id &&
          l._count.assets === 0,
      )
      .map((l) => l.id);
    if (locSobrantes.length) await prisma.location.deleteMany({ where: { id: { in: locSobrantes } } });

    console.log('\n--- Resumen ---');
    console.log(`Dependencias repetidas eliminadas: ${orgSobrantes.length}, ubicaciones repetidas eliminadas: ${locSobrantes.length}`);
    console.log(`Sedes creadas: ${sitesCreados}`);
    console.log(`Dependencias creadas: ${orgCreadas}`);
    console.log(`Ubicaciones creadas: ${locCreadas}`);
    console.log(`Responsables creados: ${usuariosCreados}`);
    console.log(`Activos creados: ${nuevos}, actualizados: ${actualizados}`);
    console.log(`Series descartadas por duplicado: ${seriesDescartadas}, bienes sin codigo patrimonial: ${sinCodigo}`);
  } finally {
    await siga.end();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
