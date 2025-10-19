import type { EmcipherApi, Profile } from "@emcipher/crypto-bridge";

let bound: null | {
  derive_km: (seed: string, convId: string, saltB64: string, profile: Profile) => string;
  derive_msg_key_base64: (kmB64: string, counter: number) => string;
  encrypt_b64: (kmsgB64: string, plaintext: string, aadUtf8: string) => { nonce_b64: string; ct_b64: string };
  decrypt_b64: (kmsgB64: string, nonce_b64: string, ct_b64: string, aadUtf8: string) => string;
} = null;

function pick<T extends Function>(m: any, names: string[]): T {
  for (const n of names) {
    if (typeof m?.[n] === "function") return m[n] as T;
  }
  return null as unknown as T;
}

export const WebCryptoBridge: EmcipherApi = {
  async init() {
    if (bound) return;

    // Load the wasm-pack JS glue from /public without bundling it.
    // @ts-ignore
    const mod: any = await import(/* webpackIgnore: true */ "/wasm/emcipher/emcipher_wasm.js");

    // Initialize wasm-bindgen if default export is provided.
    if (typeof mod?.default === "function") {
      await mod.default();
    }

    // Try multiple common symbol names (snake_case from Rust or camelCase transforms)
    const derive_km = pick(mod, ["derive_km", "deriveKm"]);
    const derive_msg_key_base64 = pick(mod, ["derive_msg_key_base64", "deriveMsgKeyBase64", "derive_msg_key_b64", "deriveMsgKeyB64"]);
    const encrypt_b64 = pick(mod, ["encrypt_b64", "encryptB64"]);
    const decrypt_b64 = pick(mod, ["decrypt_b64", "decryptB64"]);

    // If any are missing, throw a descriptive error listing available keys to help debug
    const missing: string[] = [];
    if (!derive_km) missing.push("derive_km / deriveKm");
    if (!derive_msg_key_base64) missing.push("derive_msg_key_base64 / deriveMsgKeyBase64");
    if (!encrypt_b64) missing.push("encrypt_b64 / encryptB64");
    if (!decrypt_b64) missing.push("decrypt_b64 / decryptB64");

    if (missing.length) {
      const keys = Object.keys(mod || {}).sort();
      // eslint-disable-next-line no-console
      console.error("WASM module exports:", keys);
      throw new Error(`WASM functions not found: ${missing.join(", ")}. See console for available exports.`);
    }

    bound = { derive_km, derive_msg_key_base64, encrypt_b64, decrypt_b64 };
  },

  deriveKm(seed: string, convId: string, saltB64: string, profile: Profile): string {
    if (!bound) throw new Error("WASM not initialized");
    return bound.derive_km(seed, convId, saltB64, profile);
  },

  deriveMsgKeyBase64(kmB64: string, counter: number): string {
    if (!bound) throw new Error("WASM not initialized");
    return bound.derive_msg_key_base64(kmB64, counter);
  },

  encryptB64(kmsgB64: string, plaintext: string, aadUtf8: string) {
    if (!bound) throw new Error("WASM not initialized");
    return bound.encrypt_b64(kmsgB64, plaintext, aadUtf8);
  },

  decryptB64(kmsgB64: string, nonce_b64: string, ct_b64: string, aadUtf8: string) {
    if (!bound) throw new Error("WASM not initialized");
    return bound.decrypt_b64(kmsgB64, nonce_b64, ct_b64, aadUtf8);
  }
};
