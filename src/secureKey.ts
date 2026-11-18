import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'anthropic_api_key';

// SecureStore has no web implementation; the web build (dev/testing only) falls back to localStorage.
const web = {
  get: () => {
    try {
      return globalThis.localStorage?.getItem(KEY) ?? null;
    } catch {
      return null;
    }
  },
  set: (v: string) => {
    try {
      globalThis.localStorage?.setItem(KEY, v);
    } catch {}
  },
  remove: () => {
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {}
  },
};

export async function getApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') return web.get();
  return SecureStore.getItemAsync(KEY);
}

export async function setApiKey(value: string): Promise<void> {
  const v = value.trim();
  if (Platform.OS === 'web') return web.set(v);
  await SecureStore.setItemAsync(KEY, v);
}

export async function deleteApiKey(): Promise<void> {
  if (Platform.OS === 'web') return web.remove();
  await SecureStore.deleteItemAsync(KEY);
}

/** For display only: "sk-ant-…a1b2". */
export function maskKey(key: string): string {
  return key.length <= 12 ? '••••' : `${key.slice(0, 7)}…${key.slice(-4)}`;
}
