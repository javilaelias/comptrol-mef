import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

function toBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase().trim();
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return defaultValue;
}

export function createRequestLoggerMiddleware(opts: { enabled?: unknown } = {}) {
  const enabled = toBoolean(opts.enabled, true);

  return function requestLogger(req: Request, res: Response, next: NextFunction) {
    if (!enabled) return next();

    const existing = req.header('x-request-id')?.trim();
    const requestId = existing || crypto.randomUUID();
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;

      // Avoid logging sensitive values (headers/body). Keep it minimal and safe by default.
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'http_request',
          requestId,
          method: req.method,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs,
          ip: req.ip,
          userAgent: req.get('user-agent') ?? null,
          ts: new Date().toISOString(),
        }),
      );
    });

    next();
  };
}

