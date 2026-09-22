// Alias de /sso en la URL exacta que gti-app construye para el canje de ticket
// (`${app.url}api/auth/sso?ticket=...`, ver AppLauncher.open() en el portal). `api/` no es un
// segmento reservado en el App Router de Next.js salvo con `route.ts` — esto es una página
// normal, no colisiona con el rewrite de /api/v1/:path* en next.config.ts.
export { default } from '@/components/sso-receiver';
