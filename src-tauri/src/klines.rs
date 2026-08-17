use crate::types::{Candle, KlinesFetchParams, KlinesFetchResult};

const ALLOWED_SYMBOLS: [&str; 10] = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
    "LINKUSDT", "LTCUSDT",
];

const ALLOWED_INTERVALS: [&str; 6] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const BINANCE_API_BASE: &str = "https://api.binance.com";
const BINANCE_KLINES_PATH: &str = "/api/v3/klines";

fn clamp_limit(value: Option<u32>, fallback: u32) -> u32 {
    let n = value.unwrap_or(fallback) as i64;
    if !(1..=1000).contains(&n) {
        return fallback;
    }
    n as u32
}

fn value_to_f64(value: &serde_json::Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|s| s.parse::<f64>().ok()))
}

fn value_to_u64(value: &serde_json::Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_str().and_then(|s| s.parse::<u64>().ok()))
}

/// Binance kline row:
/// [ openTimeMs, open, high, low, close, volume, closeTime, ... ]
fn map_binance_kline(row: &[serde_json::Value]) -> Option<Candle> {
    if row.len() < 6 {
        return None;
    }
    let open_time_ms = value_to_u64(&row[0])?;
    let open = value_to_f64(&row[1])?;
    let high = value_to_f64(&row[2])?;
    let low = value_to_f64(&row[3])?;
    let close = value_to_f64(&row[4])?;
    let volume = value_to_f64(&row[5]);

    Some(Candle {
        time: open_time_ms / 1000,
        open,
        high,
        low,
        close,
        volume,
    })
}

struct UpstreamError {
    status: u16,
    detail: String,
}

async fn fetch_binance_klines(
    symbol: &str,
    interval: &str,
    start_time: Option<i64>,
    end_time: Option<i64>,
    limit: u32,
) -> Result<Vec<Candle>, UpstreamError> {
    let url = format!("{BINANCE_API_BASE}{BINANCE_KLINES_PATH}");
    let mut parsed = reqwest::Url::parse(&url).map_err(|e| UpstreamError {
        status: 0,
        detail: e.to_string(),
    })?;
    {
        let mut query = parsed.query_pairs_mut();
        query.append_pair("symbol", symbol);
        query.append_pair("interval", interval);
        query.append_pair("limit", &limit.to_string());
        if let Some(st) = start_time {
            query.append_pair("startTime", &st.to_string());
        }
        if let Some(et) = end_time {
            query.append_pair("endTime", &et.to_string());
        }
    }

    let response = reqwest::Client::new()
        .get(parsed)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| UpstreamError {
            status: 0,
            detail: e.to_string(),
        })?;

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err(UpstreamError {
            status: status.as_u16(),
            detail,
        });
    }

    let rows: Vec<Vec<serde_json::Value>> = response.json().await.map_err(|e| UpstreamError {
        status: 0,
        detail: e.to_string(),
    })?;

    Ok(rows
        .iter()
        .filter_map(|row| map_binance_kline(row))
        .collect())
}

fn failure(
    status: u16,
    error: &str,
    detail: Option<String>,
    upstream_status: Option<u16>,
) -> KlinesFetchResult {
    KlinesFetchResult {
        ok: false,
        candles: None,
        status: Some(status),
        error: Some(error.to_string()),
        detail,
        upstream_status,
    }
}

fn parse_optional_ms(value: Option<i64>, name: &str) -> Result<Option<i64>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value < 0 {
        return Err(format!("Invalid {name}"));
    }
    Ok(Some(value))
}

/// Fetch Binance klines from the Rust side (no CORS / renderer restrictions).
#[tauri::command]
pub async fn klines_fetch(params: KlinesFetchParams) -> Result<KlinesFetchResult, String> {
    let symbol = params.symbol.trim().to_uppercase();
    let interval = params.interval.trim().to_string();

    if symbol.is_empty() || !ALLOWED_SYMBOLS.contains(&symbol.as_str()) {
        return Ok(failure(400, "Invalid or unsupported symbol", None, None));
    }

    if interval.is_empty() || !ALLOWED_INTERVALS.contains(&interval.as_str()) {
        return Ok(failure(400, "Invalid or unsupported interval", None, None));
    }

    let start_time = match parse_optional_ms(params.start_time, "startTime") {
        Ok(v) => v,
        Err(e) => return Ok(failure(400, &e, None, None)),
    };
    let end_time = match parse_optional_ms(params.end_time, "endTime") {
        Ok(v) => v,
        Err(e) => return Ok(failure(400, &e, None, None)),
    };

    if let (Some(start), Some(end)) = (start_time, end_time) {
        if start >= end {
            return Ok(failure(
                400,
                "startTime must be less than endTime",
                None,
                None,
            ));
        }
    }

    let limit = clamp_limit(params.limit, 500);

    match fetch_binance_klines(&symbol, &interval, start_time, end_time, limit).await {
        Ok(candles) => Ok(KlinesFetchResult {
            ok: true,
            candles: Some(candles),
            status: None,
            error: None,
            detail: None,
            upstream_status: None,
        }),
        Err(err) => {
            let upstream_status = if err.status > 0 {
                Some(err.status)
            } else {
                None
            };

            let (client_message, status) = match err.status {
                429 => ("Binance rate limit reached — try again shortly", 429),
                418 => ("Binance temporarily blocked this IP — try again later", 503),
                s if (400..500).contains(&s) => ("Binance rejected the klines request", 502),
                _ => ("Failed to fetch klines from Binance", 502),
            };

            Ok(failure(
                status,
                client_message,
                Some(err.detail),
                upstream_status,
            ))
        }
    }
}
