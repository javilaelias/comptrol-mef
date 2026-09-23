'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { clearToken } from '@/lib/auth';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { useRequireAuth } from '@/lib/requireAuth';
import { TopNav } from '@/components/TopNav';
import { formatDate, formatMoney } from '../intangibles/types';
import { buttonClass, ErrorBox, inputClass, Pager } from '../intangibles/ui';

type LicenseStatus = 'active' | 'expiring' | 'expired' | 'suspended' | 'retired';

type License = {
  id: string;
  softwareName: string;
  vendor: string | null;
  licenseType: string;
  totalSeats: number;
  unitCost: string;
  renewalDate: string | null;
  status: LicenseStatus;
  origin: string;
};

type ListResponse = {
  total: number;
  items: License[];
  byStatus: Array<{ status: LicenseStatus; licenses: number; seats: number }>;
};

type Member = {
  code: string;
  description: string;
  active: boolean;
  condition: string | null;
  expiresAt: string | null;
  poNumber: number | null;
  poYear: number | null;
  initialValue: number | null;
};

const TAKE = 50;

const STATUS: Record<LicenseStatus, { label: string; className: string }> = {
  active: { label: 'Vigente', className: 'bg-emerald-100 text-emerald-800' },
  expiring: { label: 'Por vencer', className: 'bg-amber-100 text-amber-900' },
  expired: { label: 'Vencida', className: 'bg-rose-100 text-rose-800' },
  suspended: { label: 'Suspendida', className: 'bg-slate-200 text-slate-700' },
  retired: { label: 'Retirada', className: 'bg-slate-100 text-slate-500' },
};

const TYPE_LABEL: Record<string, string> = {
  per_user: 'Por usuario',
  per_device: 'Por equipo',
  concurrent: 'Concurrente',
  subscription: 'Suscripción',
  enterprise: 'Corporativa',
  perpetual: 'Perpetua',
};

export default function LicensesPage() {
  const router = useRouter();
  useRequireAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [origin, setOrigin] = useState('');
  const [data, setData] = useState<ListResponse | null>(null);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, Member[]>>({});

  const handleError = useCallback(
    (err: unknown) => {
      if (getErrorStatus(err) === 401) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(getErrorMessage(err));
    },
    [router],
  );

  const load = useCallback(
    async (nextSkip: number) => {
      setLoading(true);
      try {
        const q = new URLSearchParams({ take: String(TAKE), skip: String(nextSkip) });
        if (search.trim()) q.set('search', search.trim());
        if (status) q.set('status', status);
        if (origin) q.set('origin', origin);
        setData(await apiFetch<ListResponse>(`/licenses?${q.toString()}`));
        setSkip(nextSkip);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [search, status, origin, handleError],
  );

  useEffect(() => {
    load(0);
    // La búsqueda se aplica con Enter o el botón; los selectores recargan al cambiar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, origin]);

  async function toggle(l: License) {
    if (open === l.id) return setOpen(null);
    setOpen(l.id);
    if (l.origin !== 'intangibles' || members[l.id]) return;
    try {
      const res = await apiFetch<{ items: Member[] }>(`/licenses/${l.id}/intangibles`);
      setMembers((m) => ({ ...m, [l.id]: res.items }));
    } catch (err) {
      handleError(err);
    }
  }

  const summary = (s: LicenseStatus) => data?.byStatus.find((b) => b.status === s);

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-7xl">
        <TopNav title="Licencias" />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-base font-semibold text-slate-900">Licencias de software</h1>
          <p className="mt-1 text-sm text-slate-600">
            Las licencias con origen <strong>Intangibles</strong> se calculan solas a partir de los bienes vigentes de{' '}
            <Link className="underline" href="/intangibles">
              Intangibles
            </Link>{' '}
            (asientos = bienes vigentes del grupo; renovación = próximo vencimiento del Excel del coordinador) y se
            actualizan con cada carga de SIGA o del Excel.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {(['active', 'expiring', 'expired', 'retired'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(status === s ? '' : s)}
                className={[
                  'rounded-xl border p-3 text-left',
                  status === s ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand-weak)]' : 'border-slate-200 hover:bg-slate-50',
                ].join(' ')}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{STATUS[s].label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{(summary(s)?.licenses ?? 0).toLocaleString('es-PE')}</p>
                <p className="text-xs text-slate-600">{(summary(s)?.seats ?? 0).toLocaleString('es-PE')} asientos</p>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              className={`${inputClass} min-w-[16rem] flex-1`}
              placeholder="Nombre o fabricante…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(0)}
            />
            <select className={inputClass} value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">Origen: todos</option>
              <option value="intangibles">Intangibles (SIGA + Excel)</option>
              <option value="manual">Cargadas manualmente</option>
            </select>
            <button className={buttonClass} onClick={() => load(0)}>
              Buscar
            </button>
          </div>

          <ErrorBox message={error} />
          {loading && <p className="mt-4 text-sm text-slate-600">Cargando…</p>}

          {data && (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-600">
                    <tr className="border-b">
                      {['Licencia', 'Fabricante', 'Tipo', 'Asientos', 'Próxima renovación', 'Estado', 'Origen'].map((h) => (
                        <th key={h} className="whitespace-nowrap py-2 pr-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((l) => (
                      <React.Fragment key={l.id}>
                        <tr className="cursor-pointer border-b hover:bg-slate-50" onClick={() => toggle(l)}>
                          <td className="min-w-[20rem] py-2 pr-3 font-medium text-slate-900">{l.softwareName}</td>
                          <td className="whitespace-nowrap py-2 pr-3">{l.vendor ?? '—'}</td>
                          <td className="whitespace-nowrap py-2 pr-3">{TYPE_LABEL[l.licenseType] ?? l.licenseType}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-right">{l.totalSeats.toLocaleString('es-PE')}</td>
                          <td className="whitespace-nowrap py-2 pr-3">{l.renewalDate ? formatDate(l.renewalDate) : 'Sin vencimiento'}</td>
                          <td className="whitespace-nowrap py-2 pr-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[l.status].className}`}>
                              {STATUS[l.status].label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2 pr-3">{l.origin === 'intangibles' ? 'Intangibles' : 'Manual'}</td>
                        </tr>
                        {open === l.id && (
                          <tr className="border-b bg-slate-50">
                            <td colSpan={7} className="px-3 py-3">
                              {l.origin !== 'intangibles' ? (
                                <p className="text-sm text-slate-600">Licencia cargada manualmente: no tiene bienes de Intangibles asociados.</p>
                              ) : !members[l.id] ? (
                                <p className="text-sm text-slate-600">Cargando bienes…</p>
                              ) : (
                                <div className="max-h-80 overflow-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead className="text-slate-500">
                                      <tr>
                                        {['Código patrimonial', 'Estado', 'OC', 'Condición', 'Vencimiento', 'Valor inicial'].map((h) => (
                                          <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">
                                            {h}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {members[l.id].map((m) => (
                                        <tr key={m.code} className={m.active ? '' : 'text-slate-400'}>
                                          <td className="whitespace-nowrap py-1 pr-3">{m.code}</td>
                                          <td className="whitespace-nowrap py-1 pr-3">{m.active ? 'Vigente' : 'De baja'}</td>
                                          <td className="whitespace-nowrap py-1 pr-3">
                                            {m.poNumber ? `${m.poNumber}-${m.poYear ?? ''}` : '—'}
                                          </td>
                                          <td className="whitespace-nowrap py-1 pr-3">{m.condition ?? 'Sin condición'}</td>
                                          <td className="whitespace-nowrap py-1 pr-3">{formatDate(m.expiresAt)}</td>
                                          <td className="whitespace-nowrap py-1 pr-3 text-right">{formatMoney(m.initialValue)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager total={data.total} take={TAKE} skip={skip} onChange={load} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
