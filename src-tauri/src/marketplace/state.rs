use crate::models::marketplace::ShopeeAuthorizationAttemptDto;
use chrono::{DateTime, Utc};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct AuthorizationAttempt {
    pub attempt_id: String,
    pub csrf_state: String,
    pub status: String,
    pub expires_at: DateTime<Utc>,
    pub message: Option<String>,
    pub marketplace_account_id: Option<String>,
}

impl AuthorizationAttempt {
    pub fn to_dto(&self) -> ShopeeAuthorizationAttemptDto {
        ShopeeAuthorizationAttemptDto {
            attempt_id: self.attempt_id.clone(),
            status: self.status.clone(),
            expires_at: self.expires_at.to_rfc3339(),
            message: self.message.clone(),
            marketplace_account_id: self.marketplace_account_id.clone(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct MarketplaceRuntimeState {
    attempts: Arc<RwLock<HashMap<String, AuthorizationAttempt>>>,
    active_syncs: Arc<RwLock<HashSet<String>>>,
}

impl MarketplaceRuntimeState {
    pub async fn insert_attempt(&self, attempt: AuthorizationAttempt) {
        self.expire_attempts().await;
        self.attempts
            .write()
            .await
            .insert(attempt.attempt_id.clone(), attempt);
    }

    pub async fn get_attempt(&self, attempt_id: &str) -> Option<AuthorizationAttempt> {
        self.expire_attempts().await;
        self.attempts.read().await.get(attempt_id).cloned()
    }

    pub async fn complete_attempt(&self, attempt_id: &str, account_id: String, message: String) {
        if let Some(attempt) = self.attempts.write().await.get_mut(attempt_id) {
            attempt.status = "SUCCEEDED".to_string();
            attempt.marketplace_account_id = Some(account_id);
            attempt.message = Some(message);
        }
    }

    pub async fn fail_attempt(&self, attempt_id: &str, message: String) {
        if let Some(attempt) = self.attempts.write().await.get_mut(attempt_id) {
            attempt.status = "FAILED".to_string();
            attempt.message = Some(message);
        }
    }

    pub async fn has_pending_authorization(&self) -> bool {
        self.expire_attempts().await;
        self.attempts
            .read()
            .await
            .values()
            .any(|attempt| attempt.status == "PENDING")
    }

    pub async fn try_start_sync(&self, account_id: &str) -> bool {
        self.active_syncs
            .write()
            .await
            .insert(account_id.to_string())
    }

    pub async fn finish_sync(&self, account_id: &str) {
        self.active_syncs.write().await.remove(account_id);
    }

    async fn expire_attempts(&self) {
        let now = Utc::now();
        let mut attempts = self.attempts.write().await;
        for attempt in attempts.values_mut() {
            if attempt.status == "PENDING" && attempt.expires_at <= now {
                attempt.status = "EXPIRED".to_string();
                attempt.message =
                    Some("Waktu otorisasi habis. Silakan hubungkan toko kembali.".to_string());
            }
        }
    }
}
