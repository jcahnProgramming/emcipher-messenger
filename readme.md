# EmCipher Messenger

Ultra-secure end-to-end encrypted messenger + EmCipher-10 obfuscation layer.

## Structure
- `/libs/emcipher-rust` – Rust crypto core (Argon2id + XChaCha20-Poly1305, HKDF)
- `/services/relay` – Fastify relay server (stateless, delete-on-ACK)
- `/apps/mobile` – React Native app (Android + iOS) [coming next]
- `/apps/web` – Next.js PWA with WASM crypto [coming next]

## Security
Do not commit secrets/keys/seeds. Use local env files. See `/docs` for threat model.

## Quick start (today)
1) Build Rust lib: `cd libs/emcipher-rust && cargo build`
2) Start relay: `cd services/relay && node index.js`
