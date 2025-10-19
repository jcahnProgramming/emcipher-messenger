//! EmCipher Rust core: HKDF-SHA256 + XChaCha20-Poly1305 helpers
//! Public API is exported from the crate root so other crates (WASM/mobile) can `use emcipher::*`.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;

/// Platform profile can influence key diversification if ever needed.
#[derive(Clone, Copy, Debug)]
pub enum Profile {
    Desktop,
    Mobile,
}

impl Profile {
    pub fn as_str(&self) -> &'static str {
        match self {
            Profile::Desktop => "desktop",
            Profile::Mobile => "mobile",
        }
    }
}

fn hkdf_32(ikm: &[u8], salt: &[u8], info: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut okm = [0u8; 32];
    hk.expand(info, &mut okm).expect("hkdf expand");
    okm
}

/// Derive a conversation master key (KM, base64) from the user's seed, a convId, a salt (base64),
/// and a Profile. Stable and deterministic.
pub fn derive_km(seed: &str, conv_id: &str, salt_b64: &str, profile: Profile) -> String {
    let seed_bytes = seed.as_bytes();
    let salt = B64
        .decode(salt_b64.as_bytes())
        .expect("salt_b64 must be valid base64");
    let info = format!("emcipher:km:{}:{}", conv_id, profile.as_str());
    let km = hkdf_32(seed_bytes, &salt, info.as_bytes());
    B64.encode(km)
}

/// Derive a per-message key (base64) from KM (base64) and a monotonic counter.
pub fn derive_msg_key_base64(km_b64: &str, counter: u32) -> String {
    let km = B64.decode(km_b64.as_bytes()).expect("km_b64 must be base64");
    let salt: [u8; 0] = [];
    let info = format!("emcipher:kmsg:{counter}");
    let kmsg = hkdf_32(&km, &salt, info.as_bytes());
    B64.encode(kmsg)
}

/// Encryption result (base64-encoded fields).
#[derive(Debug, Clone)]
pub struct EncOut {
    pub nonce_b64: String,
    pub ct_b64: String,
}

/// Encrypt `plaintext` using message key (base64) and AAD (UTF-8).
pub fn encrypt_b64(kmsg_b64: &str, plaintext: &str, aad_utf8: &str) -> EncOut {
    let key_bytes = B64
        .decode(kmsg_b64.as_bytes())
        .expect("kmsg_b64 must be base64");
    let key = Key::from_slice(&key_bytes);
    let cipher = XChaCha20Poly1305::new(key);

    // 24-byte XChaCha20 nonce
    let mut nonce_raw = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut nonce_raw);
    let nonce = XNonce::from_slice(&nonce_raw);

    let aad = aad_utf8.as_bytes();
    let ct = cipher
        .encrypt(nonce, chacha20poly1305::aead::Payload {
            msg: plaintext.as_bytes(),
            aad,
        })
        .expect("encryption failed");

    EncOut {
        nonce_b64: B64.encode(nonce_raw),
        ct_b64: B64.encode(ct),
    }
}

/// Decrypt to plaintext using message key (base64), nonce (base64), and AAD (UTF-8).
pub fn decrypt_b64(kmsg_b64: &str, nonce_b64: &str, ct_b64: &str, aad_utf8: &str) -> String {
    let key_bytes = B64
        .decode(kmsg_b64.as_bytes())
        .expect("kmsg_b64 must be base64");
    let key = Key::from_slice(&key_bytes);
    let cipher = XChaCha20Poly1305::new(key);

    let nonce_raw = B64
        .decode(nonce_b64.as_bytes())
        .expect("nonce_b64 must be base64");
    let nonce = XNonce::from_slice(&nonce_raw);

    let ct = B64.decode(ct_b64.as_bytes()).expect("ct_b64 must be base64");
    let aad = aad_utf8.as_bytes();

    let pt = cipher
        .decrypt(nonce, chacha20poly1305::aead::Payload { msg: &ct, aad })
        .expect("decryption failed");
    String::from_utf8(pt).expect("plaintext must be UTF-8")
}

// ---- Re-export API at crate root so other crates can `use emcipher::*` ----
pub use EncOut as EncryptResult;
