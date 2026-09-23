# Datos de SIGA en Comptrol: qué vas a ver y por qué

> **Números reales de producción:** los conteos de este documento son de la corrida de
> desarrollo local (base que ya tenía activos previos del Excel). Los números reales de
> **staging** (37,369 activos: 34,169 de SIGA + 3,200 preexistentes) están en
> `ESTADO_PROYECTO.md`, sección "Carga de SIGA (2026-09-23)".

El inventario de Comptrol se carga desde el **patrimonio de SIGA** (corte del 15/07/2026). La importación tomó tres decisiones que cambian lo que aparece en la app. Si un activo o un número no cuadra con lo que esperas, lo más probable es que se explique por una de ellas.

Para quien administra la app, al final está cómo cambiar cada decisión.

---

## 1. Solo están los equipos de tecnología

SIGA registra 84,857 bienes patrimoniales. Comptrol trae **34,169**: los de la clase **Cómputo** y los de **Equipo de telecomunicaciones** del catálogo SBN.

**Lo que no vas a encontrar en Comptrol:**

| Tipo de bien en SIGA | Cantidad |
|---|---|
| Mobiliario de oficina | 29,420 |
| Intangibles (software y licencias registrados como patrimonio) | 10,120 |
| Aire acondicionado y refrigeración | 3,500 |
| Equipos de electricidad y electrónica | 2,367 |
| Otros (oficina, seguridad, cocina, talleres, bienes culturales, limpieza) | 5,281 |

**Por qué:** Comptrol es un inventario de tecnología. Mezclar sillas y escritorios con laptops y servidores distorsionaría los reportes y los tableros.

**Los bienes dados de baja sí están.** Aparecen con estado `retired` (10,194 equipos), para que se pueda consultar su historia. Lo vigente está en `in_use`, asignado a alguien (12,343), e `in_stock`, sin asignar (11,670).

> La app muestra los estados y tipos con su nombre en inglés, tal como aparecen en esta guía entre `comillas`.

---

## 2. Los responsables son usuarios que no pueden ingresar

Para que cada equipo muestre a su responsable, la app necesita que esa persona exista como usuario. Por eso se crearon **3,245 usuarios** a partir del personal de SIGA.

**Cómo reconocerlos:**
- Su correo es ficticio: `siga-<código de empleado>@siga.local`. **No reciben correos.**
- Están **inactivos** y no tienen contraseña: **no pueden iniciar sesión**.
- Tienen el rol `employee` y el proveedor de acceso `siga`.

**Qué implica:** la lista de usuarios de la app ahora es larga. Los usuarios reales que administran Comptrol siguen siendo los mismos de antes.

---

## 3. Muchos equipos tienen el tipo `other`

La app clasifica los activos en unos pocos tipos. Los periféricos no tienen categoría propia, así que caen en `other`:

| Tipo en Comptrol | Cantidad | Qué incluye |
|---|---|---|
| `other` | 21,087 | Teclados (7,792), monitores (6,986), teléfonos fijos e IP (3,014), impresoras (587), escáneres, proyectores |
| `desktop` | 7,296 | CPU, computadoras personales de escritorio |
| `laptop` | 3,599 | Computadoras portátiles |
| `network` | 1,684 | Switches, routers, firewalls, balanceadores |
| `server` | 324 | Servidores |
| `mobile` | 217 | Tabletas y celulares (los teléfonos de escritorio **no** cuentan como móviles) |

**Por qué:** el tipo se deduce de la descripción del bien en SIGA. Para distinguir monitores, impresoras o teléfonos habría que agregar esos tipos a la app.

**Qué hacer:** para buscar un periférico, usa la búsqueda por descripción ("MONITOR", "IMPRESORA") en vez del filtro por tipo.

---

## Cómo leer el Dashboard con estos datos

- **Total de activos: 34,207** y **Valor total del inventario: S/ 45,986,496**. El valor es el valor en libros: lo que costó cada equipo menos su depreciación, según SIGA.
- **Equipos para e-Waste: 21,864.** El indicador suma todo lo que está `in_stock` o `retired`, así que incluye 11,670 equipos sin asignar guardados en depósito. **No significa que haya 21 mil equipos para desechar.** Los dados de baja son 10,194.
- **Activos sin reporte (30d): 12,343.** Son todos los equipos `in_use`. SIGA no registra si un equipo se conecta a la red; ese dato lo completa el agente de inventario de Windows cuando se instala en cada equipo.

---

## Otros detalles que puedes notar

- **Series vacías:** SIGA usa marcas como "S/S", "ILEGIBLE" o "INACCESIBLE" cuando el equipo no tiene serie legible. Esas quedan en blanco. También quedan en blanco 736 series repetidas entre equipos distintos, porque Comptrol exige que cada serie sea única.
- **Etiquetas que empiezan con `SIGA-`:** son 504 bienes que en SIGA no tienen código patrimonial. Se les asignó `SIGA-<modalidad>-<secuencia>` para poder identificarlos.
- **Equipos que ya estaban en la app:** los 8,933 activos cargados antes desde el Excel "EQUIPOS TECNOLÓGICOS" eran los mismos de SIGA, con el mismo código patrimonial. No se duplicaron: se actualizaron con los datos de SIGA, que son más completos.

---

## Para administradores: cómo cambiar estas decisiones

La importación se vuelve a correr con `npm run import:siga` (ver el [README](../README.md#importar-el-patrimonio-de-siga)). Se puede repetir las veces que haga falta: actualiza los equipos existentes y no duplica nada. Cada decisión se controla con una variable de entorno:

| Decisión | Variable | Valor para cambiarla |
|---|---|---|
| Importar todo el patrimonio, no solo TI | `SIGA_SOLO_TI` | `0` |
| Excluir los bienes dados de baja | `SIGA_INCLUIR_BAJAS` | `0` |
| No crear usuarios para los responsables (los equipos quedan sin responsable) | `SIGA_CREAR_USUARIOS` | `0` |
| Ver qué haría sin escribir nada | `SIGA_DRY_RUN` | `1` |

El tipo de equipo (decisión 3) no tiene variable: se define en la función `inferirTipo` de `apps/importer/scripts/import-siga.ts`.

Ejemplo en PowerShell, desde la raíz del repositorio:

```powershell
$env:SIGA_SOLO_TI = "0"; npm run import:siga
```

Ojo: al volver a poner `SIGA_SOLO_TI=1` los bienes que no son de TI **no se borran** de la app. La importación solo agrega y actualiza.
