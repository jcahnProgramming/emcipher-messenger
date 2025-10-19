use wasm_bindgen::prelude::*;
use js_sys::{Object, Reflect};
use wasm_bindgen::JsValue;

use emcipher::{
    derive_km as core_derive_km,
    derive_msg_key_base64 as core_derive_msg_key_base64,
    encrypt_b64 as core_encrypt_b64,
    decrypt_b64 as core_decrypt_b64,
    Profile,
};

fn to_profile(s: &str) -> Profile {
    match s {
        "mobile" | "Mobile" => Profile::Mobile,
        _ => Profile::Desktop,
    }
}

#[wasm_bindgen]
pub fn derive_km(seed: &str, conv_id: &str, salt_b64: &str, profile: &str) -> String {
    let p = to_profile(profile);
    core_derive_km(seed, conv_id, salt_b64, p)
}

#[wasm_bindgen]
pub fn derive_msg_key_base64(km_b64: &str, counter: u32) -> String {
    core_derive_msg_key_base64(km_b64, counter)
}

#[wasm_bindgen]
pub fn encrypt_b64(kmsg_b64: &str, plaintext: &str, aad_utf8: &str) -> Result<JsValue, JsValue> {
    let out = core_encrypt_b64(kmsg_b64, plaintext, aad_utf8);
    let obj = Object::new();
    Reflect::set(&obj, &"nonce_b64".into(), &JsValue::from_str(&out.nonce_b64))?;
    Reflect::set(&obj, &"ct_b64".into(), &JsValue::from_str(&out.ct_b64))?;
    Ok(JsValue::from(obj))
}

#[wasm_bindgen]
pub fn decrypt_b64(kmsg_b64: &str, nonce_b64: &str, ct_b64: &str, aad_utf8: &str) -> String {
    core_decrypt_b64(kmsg_b64, nonce_b64, ct_b64, aad_utf8)
}
