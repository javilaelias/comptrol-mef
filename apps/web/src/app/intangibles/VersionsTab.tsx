'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getErrorStatus } from '@/lib/errors';
import { formatDate, type BatchItem, type UploadResult } from './types';
import { buttonClass, inputClass, primaryButtonClass } from './ui';

const MAX_MB = 20;

/** "INTANGIBLES AL 30.06 (version 1)…" → "2026-06-30" (año actual, o el anterior si la fecha aún no llegó). */
export function suggestCutDate(fileName: string, today = new Date()): string {
  const m = /\bAL\s+(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/i.exec(fileName);
  if (!m) return '';
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
  if (!m[3] && new Date(year, month - 1, day) > today) year -= 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function VersionsTab({ onError, onChanged }: { onError: (err: unknown) => void; onChanged: () => void }) {
  const [batches, setBatches] = useState<BatchItem[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cutDate, setCutDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const load = useCallback(async () => {
    try {
      setBatches(await apiFetch<BatchItem[]>('/intangibles/batches'));
    } catch (err) {
      onError(err);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  function pickFile(f: File | null) {
    setFile(f);
    setResult(null);
    setUploadError(null);
    if (f) setCutDate(suggestCutDate(f.name));
  }

  async function upload() {
    if (!file || !cutDate) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setUploadError('Solo se aceptan archivos Excel .xlsx.');
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`El archivo supera los ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('cutDate', cutDate);
      const res = await apiFetch<UploadResult>('/intangibles/batches/coordinator', { method: 'POST', body: fd });
      setResult(res);
      setFile(null);
      await load();
      onChanged();
    } catch (err) {
      if (getErrorStatus(err) === 401) return onError(err);
      if (getErrorStatus(err) === 413) setUploadError(`El archivo supera los ${MAX_MB} MB.`);
      else setUploadError((err as { message?: string }).message ?? 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  }

  async function makeCurrent(b: BatchItem) {
    if (!confirm(`¿Usar la versión del ${formatDate(b.cutDate)} (${b.fileName ?? 'SIGA'}) como vigente?`)) return;
    try {
      await apiFetch(`/intangibles/batches/${b.id}/make-current`, { method: 'POST' });
      await load();
      onChanged();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div className="mt-4 grid gap-6">
      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Subir una nueva versión del Excel del coordinador</h2>
        <p className="mt-1 text-sm text-slate-600">
          Se lee la hoja con las columnas COD PATRIMONIAL, DESCRIPCION DEL BIEN, CONDICION y FECHA DE VENCIMIENTO (la
          hoja &quot;margesi&quot;); las demás hojas se ignoran. La versión nueva queda como vigente y las anteriores se
          conservan.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-slate-700">
            Archivo (.xlsx, máx. {MAX_MB} MB)
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-1 block text-sm"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="text-sm text-slate-700">
            Fecha de corte
            <input type="date" className={`${inputClass} mt-1 block`} value={cutDate} onChange={(e) => setCutDate(e.target.value)} />
          </label>
          <button className={primaryButtonClass} disabled={!file || !cutDate || uploading} onClick={upload}>
            {uploading ? 'Subiendo y validando…' : 'Subir'}
          </button>
        </div>
        {uploadError && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{uploadError}</p>
        )}
        {result && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p>
              Versión cargada: <strong>{result.rowCount.toLocaleString('es-PE')}</strong> bienes con corte{' '}
              {formatDate(result.cutDate)}.
              {result.discarded > 0 && ` ${result.discarded} filas descartadas.`}
              {result.warningCount > 0 && ` ${result.warningCount} advertencias:`}
            </p>
            {result.warnings.length > 0 && (
              <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 text-emerald-900/90">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    Fila {w.row}: {w.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900">Historial de versiones</h2>
        <p className="mt-1 text-sm text-slate-600">
          Las versiones de SIGA se cargan por script (<code>npm run import:siga-intangibles</code>) porque el dump de SIGA
          es demasiado grande para subirlo por la web.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-600">
              <tr className="border-b">
                {['Fuente', 'Corte', 'Archivo', 'Bienes', 'Advertencias', 'Subido por', 'Fecha de carga', ''].map((h) => (
                  <th key={h} className="whitespace-nowrap py-2 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches?.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3">{b.source === 'siga' ? 'SIGA' : 'Excel coordinador'}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{formatDate(b.cutDate)}</td>
                  <td className="max-w-[20rem] truncate py-2 pr-3" title={b.fileName ?? ''}>
                    {b.fileName ?? '—'}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">{b.rowCount.toLocaleString('es-PE')}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">{b.warningCount + b.discarded || '—'}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{b.uploadedBy?.fullName ?? (b.source === 'siga' ? 'script' : '—')}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{new Date(b.createdAt).toLocaleString('es-PE')}</td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    {b.isCurrent ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Vigente</span>
                    ) : (
                      <button className={buttonClass} onClick={() => makeCurrent(b)}>
                        Usar esta versión
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
