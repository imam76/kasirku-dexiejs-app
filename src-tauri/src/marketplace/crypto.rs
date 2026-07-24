use super::{MarketplaceError, MarketplaceResult};
use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;

const NONCE_LENGTH: usize = 12;
const ENVELOPE_VERSION: &str = "v1";

#[derive(Clone)]
pub struct TokenCipher {
    cipher: Aes256Gcm,
}

impl TokenCipher {
    pub fn from_base64_key(encoded_key: &str) -> MarketplaceResult<Self> {
        let key = STANDARD.decode(encoded_key.trim()).map_err(|_| {
            MarketplaceError::configuration(
                "SHOPEE_TOKEN_ENCRYPTION_KEY harus berupa base64 dari 32 byte.",
            )
        })?;
        if key.len() != 32 {
            return Err(MarketplaceError::configuration(
                "SHOPEE_TOKEN_ENCRYPTION_KEY harus berisi tepat 32 byte.",
            ));
        }

        Ok(Self {
            cipher: Aes256Gcm::new_from_slice(&key).map_err(|_| {
                MarketplaceError::configuration("Kunci enkripsi token Shopee tidak valid.")
            })?,
        })
    }

    pub fn encrypt(&self, plaintext: &str, aad: &str) -> MarketplaceResult<String> {
        let mut nonce_bytes = [0u8; NONCE_LENGTH];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = self
            .cipher
            .encrypt(
                nonce,
                Payload {
                    msg: plaintext.as_bytes(),
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| {
                MarketplaceError::new("TOKEN_ENCRYPTION_FAILED", "Token Shopee gagal dienkripsi.")
            })?;

        let mut envelope = nonce_bytes.to_vec();
        envelope.extend_from_slice(&ciphertext);
        Ok(format!("{ENVELOPE_VERSION}:{}", STANDARD.encode(envelope)))
    }

    pub fn decrypt(&self, envelope: &str, aad: &str) -> MarketplaceResult<String> {
        let (version, encoded) = envelope.split_once(':').ok_or_else(|| {
            MarketplaceError::new(
                "TOKEN_DECRYPTION_FAILED",
                "Format token Shopee terenkripsi tidak valid. Hubungkan ulang toko.",
            )
        })?;
        if version != ENVELOPE_VERSION {
            return Err(MarketplaceError::new(
                "TOKEN_DECRYPTION_FAILED",
                "Versi token Shopee terenkripsi tidak didukung. Hubungkan ulang toko.",
            ));
        }

        let bytes = STANDARD.decode(encoded).map_err(|_| {
            MarketplaceError::new(
                "TOKEN_DECRYPTION_FAILED",
                "Token Shopee tidak dapat dibaca. Hubungkan ulang toko.",
            )
        })?;
        if bytes.len() <= NONCE_LENGTH {
            return Err(MarketplaceError::new(
                "TOKEN_DECRYPTION_FAILED",
                "Token Shopee tidak lengkap. Hubungkan ulang toko.",
            ));
        }

        let (nonce_bytes, ciphertext) = bytes.split_at(NONCE_LENGTH);
        let plaintext = self
            .cipher
            .decrypt(
                Nonce::from_slice(nonce_bytes),
                Payload {
                    msg: ciphertext,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| {
                MarketplaceError::new(
                    "TOKEN_DECRYPTION_FAILED",
                    "Token Shopee tidak dapat didekripsi. Periksa kunci atau hubungkan ulang toko.",
                )
            })?;

        String::from_utf8(plaintext).map_err(|_| {
            MarketplaceError::new(
                "TOKEN_DECRYPTION_FAILED",
                "Isi token Shopee terenkripsi tidak valid. Hubungkan ulang toko.",
            )
        })
    }
}

pub fn token_aad(shop_id: i64, token_type: &str) -> String {
    format!("SHOPEE:{shop_id}:{token_type}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cipher() -> TokenCipher {
        TokenCipher::from_base64_key(&STANDARD.encode([7u8; 32])).unwrap()
    }

    #[test]
    fn token_encryption_round_trip_uses_random_nonce() {
        let cipher = cipher();
        let aad = token_aad(123, "access");
        let first = cipher.encrypt("secret-token", &aad).unwrap();
        let second = cipher.encrypt("secret-token", &aad).unwrap();

        assert_ne!(first, second);
        assert_eq!(cipher.decrypt(&first, &aad).unwrap(), "secret-token");
        assert_eq!(cipher.decrypt(&second, &aad).unwrap(), "secret-token");
    }

    #[test]
    fn token_cannot_be_moved_to_another_shop_or_column() {
        let cipher = cipher();
        let encrypted = cipher
            .encrypt("secret-token", &token_aad(123, "access"))
            .unwrap();

        assert!(cipher
            .decrypt(&encrypted, &token_aad(124, "access"))
            .is_err());
        assert!(cipher
            .decrypt(&encrypted, &token_aad(123, "refresh"))
            .is_err());
    }
}
