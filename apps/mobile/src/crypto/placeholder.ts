// TEMPORARY crypto placeholder so the app flow runs.
// Step 10 will swap in the real Rust-native bridge or WASM shim.

import { Base64 } from 'js-base64';

export function deriveKm(
  seed: string,
  convId: string,
  _saltB64: string,
  _profile: 'desktop'|'mobile'
): string {
  const blob = `${seed}#${convId}`;
  return Base64.fromUint8Array(new TextEncoder().encode(blob)).slice(0, 44);
}

export function deriveMsgKeyBase64(kmB64: string, counter: number): string {
  const s = `${kmB64}:${counter}`;
  return Base64.fromUint8Array(new TextEncoder().encode(s));
}

export function encryptB64(
  _kmsgB64: string,
  plaintext: string,
  aad: string
): { nonce_b64: string; ct_b64: string } {
  const nonce = Math.random().toString(36).slice(2);
  const payload = `PT:${plaintext}|AAD:${aad}`;
  return {
    nonce_b64: Base64.fromUint8Array(new TextEncoder().encode(nonce)),
    ct_b64: Base64.fromUint8Array(new TextEncoder().encode(payload))
  };
}

export function decryptB64(
  _kmsgB64: string,
  _nonce_b64: string,
  ct_b64: string,
  _aad: string
): string {
  const decoded = new TextDecoder().decode(Base64.toUint8Array(ct_b64));
  const m = decoded.match(/^PT:(.*)\|AAD:/);
  return m ? m[1] : '(invalid placeholder ciphertext)';
}
