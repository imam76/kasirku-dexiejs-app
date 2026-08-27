use chrono::{DateTime, Utc};
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProductUpsertInputDto {
    #[serde(flatten)]
    pub product: ProductDto,
    // Product master sync must be stock-neutral by default. Older queue rows
    // omit this field, so defaulting to false would replay their stock snapshot
    // before the stock mutation delta and double the quantity.
    #[serde(default = "default_preserve_stock")]
    pub preserve_stock: bool,
}

const fn default_preserve_stock() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::ProductUpsertInputDto;
    use serde_json::json;

    fn product_payload() -> serde_json::Value {
        json!({
            "id": "product-1",
            "name": "Product",
            "category": null,
            "purchase_unit": "pcs",
            "selling_unit": "pcs",
            "purchase_price": 1.0,
            "selling_price": 2.0,
            "stock": 8.0,
            "min_stock": null,
            "sku": null,
            "product_type": "FINISHED_GOOD",
            "is_visible_in_pos": true,
            "wholesale_prices": null,
            "sellable_units": null,
            "unit_mappings": null,
            "created_at": "2026-08-28T00:00:00Z",
            "updated_at": "2026-08-28T00:00:00Z",
            "deleted_at": null
        })
    }

    #[test]
    fn missing_preserve_stock_defaults_to_true_for_legacy_queue_rows() {
        let input: ProductUpsertInputDto = serde_json::from_value(product_payload()).unwrap();
        assert!(input.preserve_stock);
    }

    #[test]
    fn explicit_legacy_stock_snapshot_can_still_opt_out() {
        let mut payload = product_payload();
        payload["preserve_stock"] = json!(false);
        let input: ProductUpsertInputDto = serde_json::from_value(payload).unwrap();
        assert!(!input.preserve_stock);
    }
}
