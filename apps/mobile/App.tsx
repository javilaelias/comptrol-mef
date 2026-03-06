import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Button, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

type AuthResponse = { accessToken: string };

type Asset = {
  id: string;
  assetTag: string;
  hostname: string | null;
  serialNumber: string | null;
  ipAddress: string | null;
  status: string;
  lastSeenAt: string | null;
  location?: { name: string; site?: { name: string } | null } | null;
};

const TOKEN_KEY = 'comptrol_token';
const API_BASE_KEY = 'comptrol_api_base';

const DEFAULT_API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') ?? 'http://localhost:3001/api/v1';

async function apiFetch<T>(apiBaseUrl: string, path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [savedToken, savedApi] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(API_BASE_KEY),
      ]);
      if (savedApi) setApiBaseUrl(savedApi);
      if (savedToken) setToken(savedToken);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return token ? (
    <ScanScreen
      apiBaseUrl={apiBaseUrl}
      token={token}
      onLogout={async () => {
        await AsyncStorage.removeItem(TOKEN_KEY);
        setToken(null);
      }}
    />
  ) : (
    <LoginScreen
      apiBaseUrl={apiBaseUrl}
      onChangeApiBaseUrl={async (next) => {
        setApiBaseUrl(next);
        await AsyncStorage.setItem(API_BASE_KEY, next);
      }}
      onLoggedIn={async (accessToken) => {
        await AsyncStorage.setItem(TOKEN_KEY, accessToken);
        setToken(accessToken);
      }}
    />
  );
}

function LoginScreen({
  apiBaseUrl,
  onChangeApiBaseUrl,
  onLoggedIn,
}: {
  apiBaseUrl: string;
  onChangeApiBaseUrl: (next: string) => Promise<void>;
  onLoggedIn: (token: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('admin@mef.gob.pe');
  const [password, setPassword] = useState('Admin123!');
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.h1}>Comptrol‑MEF (Móvil)</Text>
      <Text style={styles.subtle}>Demo mínimo: login local + escaneo QR + consulta por Asset Tag.</Text>

      <Text style={styles.label}>API Base URL</Text>
      <TextInput style={styles.input} value={apiBaseUrl} onChangeText={(t) => onChangeApiBaseUrl(t.trim())} />

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} autoCapitalize="none" onChangeText={setEmail} />

      <Text style={styles.label}>Password</Text>
      <TextInput style={styles.input} value={password} secureTextEntry onChangeText={setPassword} />

      <View style={styles.row}>
        <Button
          title={busy ? 'Ingresando…' : 'Ingresar'}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              const res = await apiFetch<AuthResponse>(apiBaseUrl, '/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
              });
              await onLoggedIn(res.accessToken);
            } catch (err: any) {
              Alert.alert('Login falló', String(err?.message ?? err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function ScanScreen({
  apiBaseUrl,
  token,
  onLogout,
}: {
  apiBaseUrl: string;
  token: string;
  onLogout: () => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [assetTag, setAssetTag] = useState('MEF-000001');
  const [asset, setAsset] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);

  const hasPermission = permission?.granted ?? false;
  const cameraOk = useMemo(() => hasPermission, [hasPermission]);

  async function lookup(tag: string) {
    setBusy(true);
    try {
      const a = await apiFetch<Asset | null>(apiBaseUrl, `/assets/by-tag/${encodeURIComponent(tag)}`, {}, token);
      setAsset(a);
      if (!a) Alert.alert('No encontrado', `No existe activo con Asset Tag: ${tag}`);
    } catch (err: any) {
      Alert.alert('Error', String(err?.message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.rowBetween}>
        <Text style={styles.h1}>Scanner</Text>
        <Button title="Salir" onPress={() => onLogout()} />
      </View>

      {!cameraOk && (
        <View style={styles.card}>
          <Text style={styles.label}>Permiso de cámara</Text>
          <Button title="Permitir cámara" onPress={() => requestPermission()} />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Asset Tag</Text>
        <TextInput style={styles.input} value={assetTag} onChangeText={setAssetTag} autoCapitalize="characters" />
        <View style={styles.rowBetween}>
          <Button title="Buscar" onPress={() => lookup(assetTag.trim())} disabled={busy} />
          <Button
            title={showCamera ? 'Cerrar cámara' : 'Escanear QR'}
            onPress={() => setShowCamera((v) => !v)}
            disabled={!cameraOk}
          />
        </View>
      </View>

      {showCamera && cameraOk && (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            onBarcodeScanned={(result) => {
              const data = (result?.data ?? '').trim();
              if (!data) return;
              setShowCamera(false);
              setAssetTag(data);
              lookup(data);
            }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Resultado</Text>
        {busy && <ActivityIndicator />}
        {!busy && !asset && <Text style={styles.subtle}>Escanea o busca un Asset Tag para ver detalles.</Text>}
        {!busy && asset && (
          <View style={{ gap: 6 }}>
            <Text style={styles.value}>Asset: {asset.assetTag}</Text>
            <Text style={styles.value}>Host: {asset.hostname ?? '—'}</Text>
            <Text style={styles.value}>Serie: {asset.serialNumber ?? '—'}</Text>
            <Text style={styles.value}>IP: {asset.ipAddress ?? '—'}</Text>
            <Text style={styles.value}>Estado: {asset.status}</Text>
            <Text style={styles.value}>Last seen: {asset.lastSeenAt ? new Date(asset.lastSeenAt).toLocaleString('es-PE') : 'Nunca'}</Text>
            <Text style={styles.value}>
              Sede/Ubicación: {(asset.location?.site?.name ?? 'Sin sede') + ' / ' + (asset.location?.name ?? 'Sin ubicación')}
            </Text>
          </View>
        )}
      </View>

      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtle: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  value: {
    fontSize: 13,
    color: '#0F172A',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
  },
  cameraWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  camera: {
    height: 260,
  },
});
