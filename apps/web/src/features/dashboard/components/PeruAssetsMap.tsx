'use client';

import React, { useEffect, useMemo, useRef } from 'react';

export type InventoryBySiteRow = {
  siteId: string | null;
  siteName: string;
  latitude: number | null;
  longitude: number | null;
  assetCount: number;
  inventoryValue: number;
};

type LatLng = [number, number];

function inferCoords(siteName: string): LatLng | null {
  const n = (siteName ?? '').toUpperCase();
  if (!n || n === 'SIN SEDE') return null;

  const map: Array<[RegExp, LatLng]> = [
    [/AREQUIPA/, [-16.409, -71.537]],
    [/AYACUCHO/, [-13.163, -74.224]],
    [/CAJAMARCA/, [-7.162, -78.51]],
    [/CUSCO/, [-13.532, -71.967]],
    [/HUANCAVELICA/, [-12.787, -74.973]],
    [/HUANUCO/, [-9.93, -76.242]],
    [/HUARAZ/, [-9.528, -77.528]],
    [/ICA/, [-14.067, -75.729]],
    [/JUNIN/, [-12.065, -75.204]], // Huancayo
    [/LA LIBERTAD/, [-8.111, -79.028]], // Trujillo
    [/LAMBAYEQUE/, [-6.771, -79.84]], // Chiclayo
    [/LORETO/, [-3.744, -73.252]], // Iquitos
    [/MADRES DE DIOS/, [-12.593, -69.189]], // Puerto Maldonado
    [/MOQUEGUA/, [-17.194, -70.935]],
    [/MOYOBAMBA|TARAPOTO/, [-6.49, -76.372]], // San Martín (Tarapoto aprox)
    [/PASCO/, [-10.667, -76.256]], // Cerro de Pasco
    [/PIURA/, [-5.194, -80.632]],
    [/PUNO/, [-15.84, -70.02]],
    [/TACNA/, [-18.014, -70.253]],
    [/TUMBES/, [-3.567, -80.451]],
    [/UCAYALI/, [-8.379, -74.553]], // Pucallpa
    [/AMAZONAS/, [-6.231, -77.872]], // Chachapoyas
    [/ABANCAY|ANDAHUAYLAS/, [-13.636, -72.881]], // Apurímac (Abancay aprox)
    [/SANTA|NUEVO CHIMBOTE/, [-9.074, -78.593]], // Chimbote
    [/HUACHO/, [-11.106, -77.613]],
  ];

  for (const [re, coord] of map) {
    if (re.test(n)) return coord;
  }

  // Default: Lima (incluye sedes/cpd/tribunal fiscal/etc.)
  return [-12.046, -77.043];
}

export function PeruAssetsMap({ rows }: { rows: InventoryBySiteRow[] }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  const points = useMemo(() => {
    return (rows ?? [])
      .map((r) => {
        const coords = r.latitude !== null && r.longitude !== null ? ([r.latitude, r.longitude] as LatLng) : inferCoords(r.siteName);
        if (!coords) return null;
        return { ...r, coords };
      })
      .filter(Boolean) as Array<InventoryBySiteRow & { coords: LatLng }>;
  }, [rows]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!mapEl.current) return;
      if (mapInstance.current) return;

      const L = await import('leaflet');
      leafletRef.current = L;

      if (cancelled) return;

      const map = L.map(mapEl.current, {
        center: [-9.19, -75.015],
        zoom: 5,
        zoomControl: true,
      });
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      const layer = L.layerGroup().addTo(map);
      (map as any)._comptrolLayer = layer;
    }

    init();

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    const map = mapInstance.current;
    const L = leafletRef.current;
    if (!L) return;
    const layer = (map as any)._comptrolLayer;
    if (!layer) return;
    layer.clearLayers();

    for (const p of points) {
      const radius = Math.max(6, Math.min(20, Math.sqrt(p.assetCount)));
      const m = L.circleMarker(p.coords, {
        radius,
        color: 'var(--brand)',
        fillColor: 'var(--brand)',
        fillOpacity: 0.5,
        weight: 2,
      }).addTo(layer);
      m.bindPopup(`<b>${p.siteName}</b><br/>Activos: ${p.assetCount.toLocaleString('es-PE')}`);
    }
  }, [points]);

  return (
    <section className="mt-6 rounded-2xl border border-[color:var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-black">Mapa Perú — distribución de activos</h2>
          <p className="mt-1 text-sm text-black/75">
            Círculos más grandes = más activos. Si una sede no tiene coordenadas, se usa una aproximación por nombre; puedes corregirlo en “Sedes”.
          </p>
        </div>
      </div>
      <div ref={mapEl} className="mt-4 h-[420px] w-full overflow-hidden rounded-2xl border border-[color:var(--color-border)]" />
    </section>
  );
}
