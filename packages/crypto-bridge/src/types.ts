export type Profile = 'desktop' | 'mobile';

export interface EmcipherApi {
  init(): Promise<void>;
  deriveKm(seed: string, convId: string, saltB64: string, profile: Profile): string;
  deriveMsgKeyBase64(kmB64: string, counter: number): string;
  encryptB64(kmsgB64: string, plaintext: string, aadUtf8: string): { nonce_b64: string; ct_b64: string };
  decryptB64(kmsgB64: string, nonce_b64: string, ct_b64: string, aadUtf8: string): string;
}
