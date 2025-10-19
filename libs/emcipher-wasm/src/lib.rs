use wasm_bindgen::prelude::*;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use emcipher::{derive_master_key, derive_message_key, encrypt_aead, decrypt_aead, KdfParams};
use chacha20poly1305::Key;

fn params_from_profile(profile: &str) -> KdfParams {
    match profile {
        "desktop" => KdfParams::DESKTOP_STRONG,
        "mobile"  => KdfParams::MOBILE_STRONG,
        _         => KdfParams::LOW_POWER,
    }
}

#[wasm_bindgen]
pub fn derive_master_key_b64(seed: &str, salt_b64: &str, conv_id: &str, profile: &str) -> Result<String, JsValue> {
    let salt = B64.decode(salt_b64.as_bytes()).map_err(|e| JsValue::from_str(&format!("bad salt b64: {e}")))?;
    let km = derive_master_key(seed, &salt, params_from_profile(profile), conv_id)
        .map_err(|e| JsValue::from_str(&format!("derive_master_key: {e}")))?;
    Ok(B64.encode(km))
}

#[wasm_bindgen]
pub fn derive_message_key_b64(km_b64: &str, counter: u32) -> Result<String, JsValue> {
    let km = B64.decode(km_b64.as_bytes()).map_err(|e| JsValue::from_str(&format!("bad km b64: {e}")))?;
    if km.len() != 32 { return Err(JsValue::from_str("km must be 32 bytes")); }
    let mut arr = [0u8;32];
    arr.copy_from_slice(&km);
    let key = derive_message_key(&arr, counter as u64).map_err(|e| JsValue::from_str(&format!("derive_message_key: {e}")))?;
    Ok(B64.encode(key.as_slice()))
}

#[wasm_bindgen]
pub fn encrypt_aead_b64(k_b64: &str, plaintext_utf8: &str, aad_utf8: &str) -> Result<JsValue, JsValue> {
    let k = B64.decode(k_b64.as_bytes()).map_err(|e| JsValue::from_str(&format!("bad k b64: {e}")))?;
    if k.len() != 32 { return Err(JsValue::from_str("key must be 32 bytes")); }
    let key = Key::from_slice(&k);
    let (nonce_b64, ct_b64) = encrypt_aead(key, plaintext_utf8.as_bytes(), aad_utf8.as_bytes())
        .map_err(|e| JsValue::from_str(&format!("encrypt: {e}")))?;
    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &"nonce_b64".into(), &JsValue::from_str(&nonce_b64))?;
    js_sys::Reflect::set(&obj, &"ct_b64".into(), &JsValue::from_str(&ct_b64))?;
    Ok(obj.into())
}

#[wasm_bindgen]
pub fn decrypt_aead_b64(k_b64: &str, nonce_b64: &str, ct_b64: &str, aad_utf8: &str) -> Result<String, JsValue> {
    let k = B64.decode(k_b64.as_bytes()).map_err(|e| JsValue::from_str(&format!("bad k b64: {e}")))?;
    if k.len() != 32 { return Err(JsValue::from_str("key must be 32 bytes")); }
    let key = Key::from_slice(&k);
    let pt = decrypt_aead(key, nonce_b64, ct_b64, aad_utf8.as_bytes())
        .map_err(|e| JsValue::from_str(&format!("decrypt: {e}")))?;
    Ok(String::from_utf8_lossy(&pt).to_string())
}
