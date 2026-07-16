export function getErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  if (!('status' in err)) return null;
  const status = (err as Record<string, unknown>).status;
  return typeof status === 'number' ? status : null;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === 'string') return message;
  }
  return String(err);
}

