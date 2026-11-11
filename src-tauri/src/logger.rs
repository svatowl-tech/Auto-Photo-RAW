//! Модуль логирования и аудита операций `logger.rs`.
//! Предоставляет потокобезопасный кольцевой буфер в памяти и запись в файл `opticull_engine.log`
//! для диагностики сбоев декодирования RAW/LFR, инициализации ONNX Runtime и генерации XMP.

use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const MAX_RING_BUFFER_ENTRIES: usize = 2000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogSeverity {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticLogRecord {
    pub id: String,
    pub timestamp_epoch_ms: u128,
    pub severity: LogSeverity,
    pub target_subsystem: String,
    pub message: String,
    pub file_path_context: Option<String>,
    pub metadata_json: Option<String>,
    pub error_stack: Option<String>,
}

#[derive(Clone)]
pub struct AppDiagnosticLogger {
    ring_buffer: Arc<Mutex<VecDeque<DiagnosticLogRecord>>>,
    log_file_path: Option<PathBuf>,
}

impl Default for AppDiagnosticLogger {
    fn default() -> Self {
        let log_dir = std::env::temp_dir().join("opticull_logs");
        let _ = fs::create_dir_all(&log_dir);
        let log_file = log_dir.join("opticull_engine.log");

        Self {
            ring_buffer: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_RING_BUFFER_ENTRIES))),
            log_file_path: Some(log_file),
        }
    }
}

impl AppDiagnosticLogger {
    pub fn record(
        &self,
        severity: LogSeverity,
        subsystem: &str,
        message: &str,
        file_context: Option<&str>,
        meta: Option<&str>,
        err: Option<&str>,
    ) {
        let epoch_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);

        let record = DiagnosticLogRecord {
            id: format!("log_{}", epoch_ms),
            timestamp_epoch_ms: epoch_ms,
            severity,
            target_subsystem: subsystem.to_string(),
            message: message.to_string(),
            file_path_context: file_context.map(|s| s.to_string()),
            metadata_json: meta.map(|s| s.to_string()),
            error_stack: err.map(|s| s.to_string()),
        };

        if let Ok(mut buffer) = self.ring_buffer.lock() {
            if buffer.len() >= MAX_RING_BUFFER_ENTRIES {
                buffer.pop_front();
            }
            buffer.push_back(record);
        }

        if let Some(ref path) = self.log_file_path {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(
                    file,
                    "[{} ms] [{:?}] [{}] {} | file={:?} | err={:?}",
                    epoch_ms, severity, subsystem, message, file_context, err
                );
            }
        }
    }

    pub fn get_recent_records(&self, limit: usize) -> Vec<DiagnosticLogRecord> {
        self.ring_buffer
            .lock()
            .map(|buf| buf.iter().rev().take(limit).cloned().collect())
            .unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut buf) = self.ring_buffer.lock() {
            buf.clear();
        }
    }
}
