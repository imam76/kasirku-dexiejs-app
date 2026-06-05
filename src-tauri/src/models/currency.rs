use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CurrencyDto {
    pub id: String,
    pub code: String,
    pub name: String,
    pub symbol: Option<String>,
    pub decimal_places: i32,
    pub is_base: bool,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CurrencyRateDto {
    pub id: String,
    pub currency_code: String,
    pub base_currency_code: String,
    pub rate_date: String,
    pub source: String,
    pub unit_amount: f64,
    pub bi_buy_rate: Option<f64>,
    pub bi_sell_rate: Option<f64>,
    pub middle_rate: f64,
    pub fetched_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiKursTransaksiRateDto {
    pub currency_code: String,
    pub rate_date: String,
    pub unit_amount: f64,
    pub bi_buy_rate: f64,
    pub bi_sell_rate: f64,
    pub middle_rate: f64,
}
