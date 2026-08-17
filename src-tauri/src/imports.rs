use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use tauri::Manager;
use uuid::Uuid;

use crate::mt_decode::decode_mt_text_buffer;
use crate::types::{
    Candle, ImportDeleteResult, ImportListResult, ImportLoadResult, ImportReadResult,
    ImportSaveResult, ImportedDatasetMeta, ImportedTimeframeStats,
};

const IMPORT_STORED_TIMEFRAMES: [&str; 6] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const DEFAULT_TIMEFRAME: &str = "15m";

fn imports_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    Ok(data_dir.join("imports"))
}

fn dataset_dir(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(imports_root(app)?.join(id))
}

fn meta_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(dataset_dir(app, id)?.join("meta.json"))
}

fn source_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(dataset_dir(app, id)?.join("source.csv"))
}

fn candles_path(app: &tauri::AppHandle, id: &str, timeframe: &str) -> Result<PathBuf, String> {
    Ok(dataset_dir(app, id)?
        .join("candles")
        .join(format!("{timeframe}.json")))
}

fn ensure_imports_root(app: &tauri::AppHandle) -> Result<(), String> {
    fs::create_dir_all(imports_root(app)?).map_err(|e| e.to_string())
}

fn read_meta(app: &tauri::AppHandle, id: &str) -> Result<Option<ImportedDatasetMeta>, String> {
    let path = meta_path(app, id)?;
    let Ok(raw) = fs::read_to_string(&path) else {
        return Ok(None);
    };
    let Ok(mut parsed) = serde_json::from_str::<ImportedDatasetMeta>(&raw) else {
        return Ok(None);
    };
    if parsed.id.is_empty() || parsed.timeframes.is_empty() {
        return Ok(None);
    }
    if parsed.source_timeframe.is_empty() {
        parsed.source_timeframe = "1m".to_string();
    }
    Ok(Some(parsed))
}

fn write_meta(app: &tauri::AppHandle, meta: &ImportedDatasetMeta) -> Result<(), String> {
    let dir = dataset_dir(app, &meta.id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(meta_path(app, &meta.id)?, raw).map_err(|e| e.to_string())
}

fn stats_for(candles: &[Candle]) -> ImportedTimeframeStats {
    let first = candles.first();
    let last = candles.last();
    ImportedTimeframeStats {
        candle_count: candles.len() as u64,
        first_time: first.map(|c| c.time).unwrap_or(0),
        last_time: last.map(|c| c.time).unwrap_or(0),
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

struct BuildMetaParams {
    id: String,
    original_file_name: String,
    symbol: String,
    candles_by_timeframe: HashMap<String, Vec<Candle>>,
    created_at: Option<String>,
}

fn build_meta(params: BuildMetaParams) -> ImportedDatasetMeta {
    let now = now_iso();
    let candles_1m = params
        .candles_by_timeframe
        .get("1m")
        .cloned()
        .unwrap_or_default();
    let mut timeframes: HashMap<String, ImportedTimeframeStats> = HashMap::new();

    for tf in IMPORT_STORED_TIMEFRAMES {
        if let Some(series) = params.candles_by_timeframe.get(tf) {
            if !series.is_empty() {
                timeframes.insert(tf.to_string(), stats_for(series));
            }
        }
    }

    let preferred = params
        .candles_by_timeframe
        .get(DEFAULT_TIMEFRAME)
        .filter(|s| !s.is_empty())
        .map(|_| DEFAULT_TIMEFRAME.to_string())
        .unwrap_or_else(|| "1m".to_string());

    let primary = stats_for(&candles_1m);

    ImportedDatasetMeta {
        id: params.id,
        symbol: params.symbol,
        source_timeframe: "1m".to_string(),
        timeframe: preferred,
        original_file_name: params.original_file_name,
        candle_count: primary.candle_count,
        first_time: primary.first_time,
        last_time: primary.last_time,
        timeframes,
        created_at: params.created_at.unwrap_or_else(|| now.clone()),
        updated_at: now,
    }
}

fn write_candles(
    app: &tauri::AppHandle,
    id: &str,
    candles_by_timeframe: &HashMap<String, Vec<Candle>>,
) -> Result<(), String> {
    let dir = dataset_dir(app, id)?.join("candles");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for tf in IMPORT_STORED_TIMEFRAMES {
        let Some(series) = candles_by_timeframe.get(tf) else {
            continue;
        };
        let raw = serde_json::to_string(series).map_err(|e| e.to_string())?;
        fs::write(candles_path(app, id, tf)?, raw).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn read_candles(
    app: &tauri::AppHandle,
    id: &str,
    timeframe: &str,
) -> Result<Option<Vec<Candle>>, String> {
    let path = candles_path(app, id, timeframe)?;
    let Ok(raw) = fs::read_to_string(&path) else {
        return Ok(None);
    };
    let Ok(parsed) = serde_json::from_str::<Vec<Candle>>(&raw) else {
        return Ok(None);
    };
    Ok(Some(parsed))
}

/// Read a selected file and decode MT4/MT5 encodings (UTF-8 / UTF-16 LE/BE).
#[tauri::command]
pub fn import_read_file(path: String) -> Result<ImportReadResult, String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Ok(ImportReadResult {
            ok: false,
            content: None,
            file_name: None,
            error: Some("No file selected".to_string()),
        });
    }
    match fs::read(&path) {
        Ok(buffer) => {
            let file_name = std::path::Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            Ok(ImportReadResult {
                ok: true,
                content: Some(decode_mt_text_buffer(&buffer)),
                file_name: Some(file_name),
                error: None,
            })
        }
        Err(e) => Ok(ImportReadResult {
            ok: false,
            content: None,
            file_name: None,
            error: Some(e.to_string()),
        }),
    }
}

/// Persist an imported dataset (meta.json + source.csv + candles per timeframe).
#[tauri::command]
pub fn import_save(
    app: tauri::AppHandle,
    content: String,
    original_file_name: String,
    symbol: String,
    candles_by_timeframe: HashMap<String, Vec<Candle>>,
    replace_id: Option<String>,
) -> Result<ImportSaveResult, String> {
    match save_import(
        &app,
        content,
        original_file_name,
        symbol,
        candles_by_timeframe,
        replace_id,
    ) {
        Ok(result) => Ok(result),
        Err(e) => Ok(ImportSaveResult {
            ok: false,
            meta: None,
            updated: None,
            error: Some(e),
        }),
    }
}

fn save_import(
    app: &tauri::AppHandle,
    content: String,
    original_file_name: String,
    symbol: String,
    candles_by_timeframe: HashMap<String, Vec<Candle>>,
    replace_id: Option<String>,
) -> Result<ImportSaveResult, String> {
    ensure_imports_root(app)?;

    let candles_1m = candles_by_timeframe.get("1m");
    if candles_1m.is_none_or(|c| c.is_empty()) {
        return Err("Missing 1-minute candles for import.".to_string());
    }

    let mut id = replace_id.filter(|i| !i.is_empty());
    let mut created_at: Option<String> = None;
    let mut updated = false;

    if let Some(ref existing_id) = id {
        let existing = read_meta(app, existing_id)?;
        let Some(existing) = existing else {
            return Err("Saved import not found for update.".to_string());
        };
        created_at = Some(existing.created_at);
        updated = true;
    } else {
        id = Some(Uuid::new_v4().to_string());
    }

    let id = id.unwrap();

    let meta = build_meta(BuildMetaParams {
        id: id.clone(),
        original_file_name,
        symbol,
        candles_by_timeframe: candles_by_timeframe.clone(),
        created_at,
    });

    let dir = dataset_dir(app, &id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(source_path(app, &id)?, content).map_err(|e| e.to_string())?;
    write_candles(app, &id, &candles_by_timeframe)?;
    write_meta(app, &meta)?;

    Ok(ImportSaveResult {
        ok: true,
        meta: Some(meta),
        updated: Some(updated),
        error: None,
    })
}

/// List saved imports, newest first.
#[tauri::command]
pub fn import_list(app: tauri::AppHandle) -> Result<ImportListResult, String> {
    match list_imports(&app) {
        Ok(imports) => Ok(ImportListResult {
            ok: true,
            imports: Some(imports),
            error: None,
        }),
        Err(e) => Ok(ImportListResult {
            ok: false,
            imports: None,
            error: Some(e),
        }),
    }
}

fn list_imports(app: &tauri::AppHandle) -> Result<Vec<ImportedDatasetMeta>, String> {
    ensure_imports_root(app)?;
    let mut imports = Vec::new();

    let entries = fs::read_dir(imports_root(app)?).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        if let Ok(Some(meta)) = read_meta(app, &entry.file_name().to_string_lossy()) {
            imports.push(meta);
        }
    }

    imports.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(imports)
}

/// Load a saved import at the requested (or default) timeframe.
#[tauri::command]
pub fn import_load(
    app: tauri::AppHandle,
    id: String,
    timeframe: Option<String>,
) -> Result<ImportLoadResult, String> {
    match load_import(&app, &id, timeframe.as_deref()) {
        Ok(result) => Ok(result),
        Err(e) => Ok(ImportLoadResult {
            ok: false,
            meta: None,
            candles: None,
            error: Some(e),
        }),
    }
}

fn load_import(
    app: &tauri::AppHandle,
    id: &str,
    timeframe: Option<&str>,
) -> Result<ImportLoadResult, String> {
    let Some(mut meta) = read_meta(app, id)? else {
        return Ok(ImportLoadResult {
            ok: false,
            meta: None,
            candles: None,
            error: Some("Saved import not found.".to_string()),
        });
    };

    let requested = timeframe.unwrap_or(&meta.timeframe);
    let requested = if requested.is_empty() {
        "1m"
    } else {
        requested
    };

    let tf = if meta.timeframes.contains_key(requested) {
        requested.to_string()
    } else if meta.timeframes.contains_key("1m") {
        "1m".to_string()
    } else {
        meta.timeframes.keys().next().cloned().unwrap_or_default()
    };

    if tf.is_empty() {
        return Ok(ImportLoadResult {
            ok: false,
            meta: None,
            candles: None,
            error: Some("Imported dataset has no candle series.".to_string()),
        });
    }

    let Some(candles) = read_candles(app, id, &tf)? else {
        return Ok(ImportLoadResult {
            ok: false,
            meta: None,
            candles: None,
            error: Some(format!("No candles found for timeframe {tf}.")),
        });
    };
    if candles.is_empty() {
        return Ok(ImportLoadResult {
            ok: false,
            meta: None,
            candles: None,
            error: Some(format!("No candles found for timeframe {tf}.")),
        });
    }

    if meta.timeframe != tf {
        meta.timeframe = tf.clone();
        let saved = ImportedDatasetMeta {
            updated_at: meta.updated_at.clone(),
            ..meta.clone()
        };
        // Persist last-used TF so symbol re-select restores it.
        let _ = write_meta(app, &saved);
    }

    Ok(ImportLoadResult {
        ok: true,
        meta: Some(meta),
        candles: Some(candles),
        error: None,
    })
}

/// Delete a saved import.
#[tauri::command]
pub fn import_delete(app: tauri::AppHandle, id: String) -> Result<ImportDeleteResult, String> {
    let id = id.trim().to_string();
    if id.is_empty() {
        return Ok(ImportDeleteResult {
            ok: false,
            error: Some("Missing import id.".to_string()),
        });
    }
    match dataset_dir(&app, &id).and_then(|dir| fs::remove_dir_all(&dir).map_err(|e| e.to_string()))
    {
        Ok(()) => Ok(ImportDeleteResult {
            ok: true,
            error: None,
        }),
        Err(e) => Ok(ImportDeleteResult {
            ok: false,
            error: Some(e),
        }),
    }
}
