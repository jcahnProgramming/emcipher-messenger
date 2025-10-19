import type { EmcipherApi, Profile } from "@emcipher/crypto-bridge";

let wasm: any | null = null;

export const WebCryptoBridge: EmcipherApi = {
  async init() {
    if (wasm) return;

    // IMPORTANT: webpackIgnore ensures Next.js doesn't try to bundle this.
    // The browser will load /wasm/emcipher/emcipher_wasm.js directly from public/.
    // That JS then resolves its own .wasm relative to itself.
    // @ts-ignore
    const mod = await import(/* webpackIgnore: true */ "/wasm/emcipher/emcipher_wasm.js");

    if (typeof mod?.default === "function") {
      await mod.default(); // initialize wasm-bindgen
    }
    wasm = mod;
  },

  deriveKm(seed: string, convId: string, saltB64: string, profile: Profile): string {
    return wasm.derive_km(seed, convId, saltB64, profile);
  },

  deriveMsgKeyBase64(kmB64: string, counter: number): string {
    return wasm.derive_msg_key_base64(kmB64, counter);
  },

  encryptB64(kmsgB64: string, plaintext: string, aadUtf8: string) {
    return wasm.encrypt_b64(kmsgB64, plaintext, aadUtf8);
  },

  decryptB64(kmsgB64: string, nonce_b64: string, ct_b64: string, aadUtf8: string) {
    return wasm.decrypt_b64(kmsgB64, nonce_b64, ct_b64, aadUtf8);
  }
};
