use std::collections::HashMap;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct Candle {
    pub time: u64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f64>,
}

#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KlinesFetchParams {
    pub symbol: String,
    pub interval: String,
    #[serde(default)]
    pub start_time: Option<i64>,
    #[serde(default)]
    pub end_time: Option<i64>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KlinesFetchResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candles: Option<Vec<Candle>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream_status: Option<u16>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportedTimeframeStats {
    pub candle_count: u64,
    pub first_time: u64,
    pub last_time: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportedDatasetMeta {
    pub id: String,
    pub symbol: String,
    pub source_timeframe: String,
    pub timeframe: String,
    pub original_file_name: String,
    pub candle_count: u64,
    pub first_time: u64,
    pub last_time: u64,
    pub timeframes: HashMap<String, ImportedTimeframeStats>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportReadResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportSaveResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ImportedDatasetMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportListResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub imports: Option<Vec<ImportedDatasetMeta>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportLoadResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ImportedDatasetMeta>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candles: Option<Vec<Candle>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportDeleteResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
