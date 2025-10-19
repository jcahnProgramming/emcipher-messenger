import * as SecureStore from 'expo-secure-store';

const KEYS = {
  seed: 'emcipher.seed',
  fakePasswords: 'emcipher.fake.passwords', // [{label,password,mode:'wipe'|'decoy'}]
};

export async function setSeed(seed: string) {
  // Use defaults to avoid SDK option shape differences
  await SecureStore.setItemAsync(KEYS.seed, seed);
}

export async function getSeed(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.seed);
}

export async function getFakePasswords():
  Promise<Array<{label:string;password:string;mode:'wipe'|'decoy'}>> {
  const raw = await SecureStore.getItemAsync(KEYS.fakePasswords);
  return raw ? JSON.parse(raw) : [];
}

export async function setFakePasswords(
  list: Array<{label:string;password:string;mode:'wipe'|'decoy'}>
) {
  await SecureStore.setItemAsync(KEYS.fakePasswords, JSON.stringify(list));
}
