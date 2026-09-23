/**
 * Un activo importado por el job de SIGA (apps/importer/scripts/import-siga.ts) siempre lleva
 * fingerprint = "siga:<sec_ejec>-<modalidad>-<secuencia>". `source` no sirve para esto: es un
 * enum genérico (`api_import`) que un futuro import de otro origen también podría usar.
 */
export function isSigaImported(fingerprint: string | null | undefined): boolean {
  return Boolean(fingerprint && fingerprint.startsWith('siga:'));
}
