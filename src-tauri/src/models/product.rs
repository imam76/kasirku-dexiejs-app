use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductDto {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub purchase_unit: String,
    pub selling_unit: String,
    pub purchase_price: f64,
    pub selling_price: f64,
    pub stock: f64,
    /// NULL untuk produk yang belum menyetel ambangnya sendiri.
    pub min_stock: Option<f64>,
    pub sku: Option<String>,
    pub product_type: String,
    pub is_visible_in_pos: bool,
    pub wholesale_prices: Option<Value>,
    pub sellable_units: Option<Value>,
    pub unit_mappings: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProductUpsertInputDto {
    #[serde(flatten)]
    pub product: ProductDto,
    #[serde(default)]
    pub preserve_stock: bool,
}
