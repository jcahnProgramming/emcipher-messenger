import type { EmcipherApi, Profile } from '@emcipher/crypto-bridge';
import { Base64 } from 'js-base64';

// Keep EXACT inputs/outputs so it interops with web’s WASM.
const bridge: EmcipherApi = {
  async init() { /* no-op for now */ },

  deriveKm(seed: string, convId: string, _saltB64: string, _profile: Profile): string {
    const blob = `${seed}#${convId}`;
    return Base64.fromUint8Array(new TextEncoder().encode(blob)).slice(0, 44);
  },

  deriveMsgKeyBase64(kmB64: string, counter: number): string {
    return Base64.fromUint8Array(new TextEncoder().encode(`${kmB64}:${counter}`));
  },

  encryptB64(_kmsgB64: string, plaintext: string, aadUtf8: string) {
    const nonce = Math.random().toString(36).slice(2);
    return {
      nonce_b64: Base64.fromUint8Array(new TextEncoder().encode(nonce)),
      ct_b64: Base64.fromUint8Array(new TextEncoder().encode(`PT:${plaintext}|AAD:${aadUtf8}`)),
    };
  },

  decryptB64(_kmsgB64: string, _nonce_b64: string, ct_b64: string, _aadUtf8: string) {
    const dec = new TextDecoder().decode(Base64.toUint8Array(ct_b64));
    const m = dec.match(/^PT:(.*)\|AAD:/);
    return m ? m[1] : '(invalid placeholder ciphertext)';
  }
};

export const MobileCryptoBridge = bridge;
