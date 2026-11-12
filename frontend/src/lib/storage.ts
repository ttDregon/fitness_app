import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Единая обёртка над key-value хранилищем: AsyncStorage на телефоне, localStorage в вебе.
// Раньше в AppContext каждая запись/чтение повторяли развилку `Platform.OS !== 'web' ? ...`
// вручную — в новых местах используем эти хелперы. Ошибки хранилища глушим: потеря кэша
// не должна ронять интерфейс.
const web = Platform.OS === 'web';
const ls = () => (typeof window !== 'undefined' ? window.localStorage : null);

export async function kvGet(key: string): Promise<string | null> {
  try { return web ? (ls()?.getItem(key) ?? null) : await AsyncStorage.getItem(key); } catch { return null; }
}

export async function kvSet(key: string, value: string): Promise<void> {
  try { if (web) ls()?.setItem(key, value); else await AsyncStorage.setItem(key, value); } catch {}
}

export async function kvRemove(key: string): Promise<void> {
  try { if (web) ls()?.removeItem(key); else await AsyncStorage.removeItem(key); } catch {}
}

export async function kvGetJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await kvGet(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export async function kvSetJSON(key: string, value: unknown): Promise<void> {
  try { await kvSet(key, JSON.stringify(value)); } catch {}
}

/** Несколько ключей за раз (на телефоне — один нативный вызов). */
export async function kvMultiGet(keys: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  try {
    if (web) keys.forEach(k => { out[k] = ls()?.getItem(k) ?? null; });
    else (await AsyncStorage.multiGet(keys)).forEach(([k, v]) => { out[k] = v; });
  } catch {}
  return out;
}
