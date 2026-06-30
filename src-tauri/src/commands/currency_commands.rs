use crate::{
    db::{PostgresCommandResult, PostgresState},
    models::currency::{BiKursTransaksiRateDto, CurrencyDto, CurrencyRateDto},
    repositories::currency_repository,
};
use chrono::NaiveDate;
use quick_xml::{events::Event, Reader};
use std::{collections::HashMap, time::Duration};
use tauri::State;

#[tauri::command]
pub async fn postgres_list_currencies(
    state: State<'_, PostgresState>,
) -> PostgresCommandResult<Vec<CurrencyDto>> {
    let pool = state.pool()?;
    Ok(currency_repository::list_currencies(&pool).await?)
}

#[tauri::command]
pub async fn postgres_get_currency(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CurrencyDto>> {
    let pool = state.pool()?;
    Ok(currency_repository::get_currency(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_currency(
    state: State<'_, PostgresState>,
    input: CurrencyDto,
) -> PostgresCommandResult<CurrencyDto> {
    let pool = state.pool()?;
    Ok(currency_repository::upsert_currency(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_currency(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CurrencyDto>> {
    let pool = state.pool()?;
    Ok(currency_repository::delete_currency(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_list_currency_rates(
    state: State<'_, PostgresState>,
    base_currency_code: Option<String>,
) -> PostgresCommandResult<Vec<CurrencyRateDto>> {
    let pool = state.pool()?;
    Ok(currency_repository::list_currency_rates(&pool, base_currency_code).await?)
}

#[tauri::command]
pub async fn postgres_get_currency_rate(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CurrencyRateDto>> {
    let pool = state.pool()?;
    Ok(currency_repository::get_currency_rate(&pool, id).await?)
}

#[tauri::command]
pub async fn postgres_upsert_currency_rate(
    state: State<'_, PostgresState>,
    input: CurrencyRateDto,
) -> PostgresCommandResult<CurrencyRateDto> {
    let pool = state.pool()?;
    Ok(currency_repository::upsert_currency_rate(&pool, input).await?)
}

#[tauri::command]
pub async fn postgres_delete_currency_rate(
    state: State<'_, PostgresState>,
    id: String,
) -> PostgresCommandResult<Option<CurrencyRateDto>> {
    let pool = state.pool()?;
    Ok(currency_repository::delete_currency_rate(&pool, id).await?)
}

#[tauri::command]
pub async fn fetch_bi_kurs_transaksi(
    currency_code: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<BiKursTransaksiRateDto>, String> {
    let currency_code = currency_code.trim().to_ascii_uppercase();
    if !is_valid_currency_code(&currency_code) {
        return Err("Kode mata uang harus 3 huruf.".to_string());
    }

    let start_date = parse_input_date(&start_date)?;
    let end_date = parse_input_date(&end_date)?;
    if end_date < start_date {
        return Err("Tanggal akhir kurs tidak boleh sebelum tanggal awal.".to_string());
    }

    let url = format!(
        "https://www.bi.go.id/biwebservice/wskursbi.asmx/getSubKursLokal3?mts={}&startdate={}&enddate={}",
        currency_code,
        start_date.format("%Y-%m-%d"),
        end_date.format("%Y-%m-%d")
    );

    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Gagal menyiapkan koneksi BI: {error}"))?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Gagal mengambil kurs BI: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("BI mengembalikan status HTTP {status}."));
    }

    let xml = response
        .text()
        .await
        .map_err(|error| format!("Gagal membaca respons BI: {error}"))?;
    parse_bi_kurs_xml(&xml, &currency_code)
}

fn is_valid_currency_code(currency_code: &str) -> bool {
    currency_code.len() == 3
        && currency_code
            .chars()
            .all(|character| character.is_ascii_alphabetic())
}

fn parse_input_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| "Tanggal kurs harus format YYYY-MM-DD.".to_string())
}

fn parse_bi_kurs_xml(
    xml: &str,
    requested_currency_code: &str,
) -> Result<Vec<BiKursTransaksiRateDto>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut rows = Vec::new();
    let mut in_table_row = false;
    let mut current_key: Option<String> = None;
    let mut current_row: HashMap<String, String> = HashMap::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(event)) => {
                let key = normalize_xml_key(event.name().as_ref());
                if is_bi_table_row_key(&key) {
                    in_table_row = true;
                    current_row.clear();
                } else if in_table_row {
                    current_key = Some(key);
                }
            }
            Ok(Event::Text(event)) => {
                if in_table_row {
                    if let Some(key) = current_key.as_ref() {
                        let value = event
                            .decode()
                            .map_err(|error| format!("Gagal membaca teks XML BI: {error}"))?
                            .into_owned();
                        if !value.trim().is_empty() {
                            current_row.insert(key.clone(), value.trim().to_string());
                        }
                    }
                }
            }
            Ok(Event::End(event)) => {
                let key = normalize_xml_key(event.name().as_ref());
                if is_bi_table_row_key(&key) && in_table_row {
                    if let Some(rate) = map_bi_row(&current_row, requested_currency_code) {
                        rows.push(rate);
                    }
                    in_table_row = false;
                    current_key = None;
                    current_row.clear();
                } else if current_key.as_deref() == Some(key.as_str()) {
                    current_key = None;
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("Gagal parsing XML BI: {error}")),
            _ => {}
        }
        buf.clear();
    }

    rows.sort_by(|left, right| left.rate_date.cmp(&right.rate_date));
    Ok(rows)
}

fn normalize_xml_key(raw_name: &[u8]) -> String {
    let name = String::from_utf8_lossy(raw_name);
    let local_name = name.rsplit(':').next().unwrap_or(name.as_ref());
    local_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(|character| character.to_lowercase())
        .collect()
}

fn is_bi_table_row_key(key: &str) -> bool {
    key == "table" || key.starts_with("table")
}

fn map_bi_row(
    row: &HashMap<String, String>,
    requested_currency_code: &str,
) -> Option<BiKursTransaksiRateDto> {
    let currency_code = find_row_value(
        row,
        &[
            "mts",
            "matauang",
            "kodematauang",
            "kode",
            "currency",
            "currencycode",
        ],
    )
    .map(|value| value.trim().to_ascii_uppercase())
    .filter(|value| is_valid_currency_code(value))
    .unwrap_or_else(|| requested_currency_code.to_string());

    let rate_date = parse_bi_date(find_row_value(
        row,
        &["tanggal", "tgl", "date", "ratedate"],
    )?)?;
    let unit_amount = find_row_value(row, &["nilai", "nominal", "unit", "unitamount", "satuan"])
        .and_then(parse_bi_number)
        .filter(|value| *value > 0.0)
        .unwrap_or(1.0);
    let bi_buy_rate =
        find_row_value(row, &["kursbeli", "beli", "buy", "bid"]).and_then(parse_bi_number)?;
    let bi_sell_rate =
        find_row_value(row, &["kursjual", "jual", "sell", "ask"]).and_then(parse_bi_number)?;
    let middle_rate = ((bi_buy_rate + bi_sell_rate) / 2.0) / unit_amount;

    Some(BiKursTransaksiRateDto {
        currency_code,
        rate_date,
        unit_amount,
        bi_buy_rate,
        bi_sell_rate,
        middle_rate,
    })
}

fn find_row_value<'a>(row: &'a HashMap<String, String>, candidates: &[&str]) -> Option<&'a str> {
    candidates
        .iter()
        .find_map(|candidate| row.get(*candidate).map(String::as_str))
        .or_else(|| {
            row.iter()
                .find(|(key, _)| {
                    candidates
                        .iter()
                        .any(|candidate| key.starts_with(candidate) || key.ends_with(candidate))
                })
                .map(|(_, value)| value.as_str())
        })
}

fn parse_bi_date(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let date_part = trimmed.split('T').next().unwrap_or(trimmed).trim();
    for format in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"] {
        if let Ok(date) = NaiveDate::parse_from_str(date_part, format) {
            return Some(date.format("%Y-%m-%d").to_string());
        }
    }
    None
}

fn parse_bi_number(value: &str) -> Option<f64> {
    let cleaned: String = value
        .trim()
        .chars()
        .filter(|character| character.is_ascii_digit() || matches!(character, '.' | ',' | '-'))
        .collect();
    if cleaned.is_empty() {
        return None;
    }

    let last_comma = cleaned.rfind(',');
    let last_dot = cleaned.rfind('.');
    let normalized = match (last_comma, last_dot) {
        (Some(comma_index), Some(dot_index)) if comma_index > dot_index => {
            cleaned.replace('.', "").replace(',', ".")
        }
        (Some(_), Some(_)) => cleaned.replace(',', ""),
        (Some(comma_index), None) => {
            let decimal_digits = cleaned.len().saturating_sub(comma_index + 1);
            if decimal_digits <= 2 {
                cleaned.replace(',', ".")
            } else {
                cleaned.replace(',', "")
            }
        }
        _ => cleaned,
    };

    normalized.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_bi_subkurslokal_rows_with_prefixed_field_names() {
        let xml = r#"
            <?xml version="1.0" encoding="utf-8"?>
            <DataSet xmlns="http://tempuri.org/">
              <diffgr:diffgram xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1">
                <NewDataSet>
                  <Table diffgr:id="Table1">
                    <mts_subkurslokal>USD</mts_subkurslokal>
                    <nilai_subkurslokal>1</nilai_subkurslokal>
                    <beli_subkurslokal>17,630.40</beli_subkurslokal>
                    <jual_subkurslokal>17,807.60</jual_subkurslokal>
                    <tanggal_subkurslokal>2026-05-20T00:00:00+07:00</tanggal_subkurslokal>
                  </Table>
                </NewDataSet>
              </diffgr:diffgram>
            </DataSet>
        "#;

        let rates = parse_bi_kurs_xml(xml, "USD").expect("sample BI XML should parse");

        assert_eq!(rates.len(), 1);
        assert_eq!(rates[0].currency_code, "USD");
        assert_eq!(rates[0].rate_date, "2026-05-20");
        assert_eq!(rates[0].unit_amount, 1.0);
        assert_eq!(rates[0].bi_buy_rate, 17630.40);
        assert_eq!(rates[0].bi_sell_rate, 17807.60);
        assert_eq!(rates[0].middle_rate, 17719.0);
    }
}
