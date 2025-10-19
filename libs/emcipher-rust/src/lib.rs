//! EmCipher crypto core
//! - KDF: Argon2id (tunable)
//! - AEAD: XChaCha20-Poly1305
//! - HKDF-based key schedule
//! NOTE: Keep seeds/passphrases HIGH ENTROPY. Argon2 helps but cannot fix weak passwords.

mod params;

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;
use thiserror::Error;
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, Key, XNonce,
};
use zeroize::Zeroize;

pub use params::KdfParams;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("argon2 failure")]
    Argon2,
    #[error("hkdf expand failure")]
    Hkdf,
    #[error("encrypt failure")]
    Encrypt,
    #[error("decrypt failure (bad key/nonce/AAD/ciphertext)")]
    Decrypt,
    #[error("bad base64 input")]
    B64,
    #[error("invalid key length")]
    KeyLen,
}

/// Derive a 32-byte master key from a seed and salt using Argon2id + HKDF.
/// KDF parameters are provided explicitly for testability and tuning.
pub fn derive_master_key(seed: &str, salt: &[u8], kdf: KdfParams, conv_id: &str) -> Result<[u8;32], CryptoError> {
    let params = Params::new(kdf.m_cost_kib, kdf.t_cost, kdf.p_cost, None).map_err(|_| CryptoError::Argon2)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    // Argon2 output length 32 bytes
    let mut prekey = [0u8; 32];
    argon.hash_password_into(seed.as_bytes(), salt, &mut prekey).map_err(|_| CryptoError::Argon2)?;

    // Domain-separated HKDF derive master key (binds to conv_id)
    let hk = Hkdf::<Sha256>::new(None, &prekey);
    let mut km = [0u8; 32];
    hk.expand(format!("emcipher:km:{conv_id}").as_bytes(), &mut km)
        .map_err(|_| CryptoError::Hkdf)?;

    // Zeroize prekey
    prekey.zeroize();

    Ok(km)
}

/// Derive per-message symmetric key from the master key and a counter.
pub fn derive_message_key(km: &[u8;32], counter: u64) -> Result<Key, CryptoError> {
    let hk = Hkdf::<Sha256>::new(None, km);
    let mut out = [0u8; 32];
    hk.expand(format!("emcipher:msg:{counter}").as_bytes(), &mut out)
        .map_err(|_| CryptoError::Hkdf)?;
    let key = Key::from_slice(&out).to_owned();
    out.zeroize();
    Ok(key)
}

/// Encrypt with AEAD using per-message key, 24-byte random nonce, and AAD.
/// Returns (nonce_b64, ciphertext_b64).
pub fn encrypt_aead(k_msg: &Key, plaintext: &[u8], aad: &[u8]) -> Result<(String, String), CryptoError> {
    let cipher = XChaCha20Poly1305::new(k_msg);
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = XNonce::from_slice(&nonce_bytes);
    let payload = Payload { msg: plaintext, aad };
    let ct = cipher.encrypt(nonce, payload).map_err(|_| CryptoError::Encrypt)?;

    let n_b64 = B64.encode(nonce_bytes);
    let ct_b64 = B64.encode(ct);

    Ok((n_b64, ct_b64))
}

/// Decrypt with AEAD using same AAD.
pub fn decrypt_aead(k_msg: &Key, nonce_b64: &str, ct_b64: &str, aad: &[u8]) -> Result<Vec<u8>, CryptoError> {
    let cipher = XChaCha20Poly1305::new(k_msg);
    let nonce_raw = B64.decode(nonce_b64.as_bytes()).map_err(|_| CryptoError::B64)?;
    if nonce_raw.len() != 24 { return Err(CryptoError::B64); }
    let nonce = XNonce::from_slice(&nonce_raw);
    let ct = B64.decode(ct_b64.as_bytes()).map_err(|_| CryptoError::B64)?;
    let payload = Payload { msg: &ct, aad };
    let pt = cipher.decrypt(nonce, payload).map_err(|_| CryptoError::Decrypt)?;
    Ok(pt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let seed = "correct horse battery staple";
        let salt = [7u8; 16];
        let conv_id = "123e4567-e89b-12d3-a456-426614174000";

        // Example robust desktop-class KDF (we’ll tune per platform later)
        let kdf = KdfParams { m_cost_kib: 262_144, t_cost: 3, p_cost: 1 }; // 256 MiB, 3 iters

        let km = derive_master_key(seed, &salt, kdf, conv_id).expect("km");
        let kmsg = derive_message_key(&km, 1).expect("kmsg");

        let aad = b"conv=123e4567;msg=1;v=1";
        let msg = b"hello, emcipher!";
        let (n, ct) = encrypt_aead(&kmsg, msg, aad).expect("enc");
        let pt = decrypt_aead(&kmsg, &n, &ct, aad).expect("dec");
        assert_eq!(pt, msg);
    }
}
