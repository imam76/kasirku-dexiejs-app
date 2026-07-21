pub mod crypto;
pub mod shopee_client;
pub mod shopee_service;
pub mod state;

use serde::Serialize;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceError {
    pub code: String,
    pub message: String,
}

impl MarketplaceError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn configuration(message: impl Into<String>) -> Self {
        Self::new("MARKETPLACE_CONFIGURATION_ERROR", message)
    }
}

impl Display for MarketplaceError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for MarketplaceError {}

impl From<sqlx::Error> for MarketplaceError {
    fn from(error: sqlx::Error) -> Self {
        eprintln!("[Marketplace database] {error}");
        Self::new(
            "MARKETPLACE_DATABASE_ERROR",
            "Database Marketplace sedang bermasalah. Silakan coba lagi.",
        )
    }
}

pub type MarketplaceResult<T> = Result<T, MarketplaceError>;
