// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub r#type: String, // "file" or "folder"
    pub path: String,
    #[serde(rename = "isPdf")]
    pub is_pdf: bool,
    #[serde(rename = "sizeMB")]
    pub size_mb: String,
    #[serde(rename = "itemCount")]
    pub item_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub name: String,
    pub r#type: String,
    pub path: String,
    #[serde(rename = "isPdf")]
    pub is_pdf: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LanInfo {
    pub ip: String,
    pub port: u16,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE PATH VALIDATOR (Prevents Path Traversal Attacks)
// ─────────────────────────────────────────────────────────────────────────────
fn resolve_safe_path(base_dir: &Path, rel_path: &str) -> Result<PathBuf, String> {
    // Sanitize string
    let clean_rel = rel_path.trim_start_matches(|c| c == '/' || c == '\\');
    let joined = base_dir.join(clean_rel);

    // Canonicalize base and joined paths
    let base_canonical = fs::canonicalize(base_dir)
        .map_err(|e| format!("Base documents directory inaccessible: {}", e))?;
    
    // If target exists, canonicalize and compare prefixes
    if joined.exists() {
        let joined_canonical = fs::canonicalize(&joined)
            .map_err(|e| format!("Target path inaccessible: {}", e))?;
        if !joined_canonical.starts_with(&base_canonical) {
            return Err("Access denied: Invalid path traversal attempt".to_string());
        }
        Ok(joined_canonical)
    } else {
        // For new files yet to be created, check parent
        let parent = joined.parent().unwrap_or(base_dir);
        if parent.exists() {
            let parent_canonical = fs::canonicalize(parent)
                .map_err(|e| format!("Parent directory inaccessible: {}", e))?;
            if !parent_canonical.starts_with(&base_canonical) {
                return Err("Access denied: Invalid path traversal attempt".to_string());
            }
        }
        Ok(joined)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EFFECTIVE DOCUMENTS DIRECTORY RESOLVER
// ─────────────────────────────────────────────────────────────────────────────
fn get_effective_docs_dir(docs_dir: Option<String>) -> PathBuf {
    if let Some(dir) = docs_dir {
        let p = PathBuf::from(&dir);
        if p.exists() {
            return p;
        }
    }

    let candidates = [
        PathBuf::from("./dzexams_downloaded_pdfs"),
        PathBuf::from("../dzexams_downloaded_pdfs"),
    ];

    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let p = parent.join("dzexams_downloaded_pdfs");
            if p.exists() {
                return p;
            }
        }
    }

    let default_p = PathBuf::from("./dzexams_downloaded_pdfs");
    let _ = fs::create_dir_all(&default_p);
    default_p
}

// ─────────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS: FILESYSTEM & DOCUMENT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn list_documents(docs_dir: Option<String>, rel_path: Option<String>) -> Result<Vec<FileEntry>, String> {
    let base_path = get_effective_docs_dir(docs_dir);

    if !base_path.exists() {
        let _ = fs::create_dir_all(&base_path);
    }

    let target_path = resolve_safe_path(&base_path, &rel_path.unwrap_or_default())?;
    if !target_path.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&target_path).map_err(|e| e.to_string())?;

    for item in read_dir.flatten() {
        let file_type = match item.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        let file_name = item.file_name().to_string_lossy().to_string();
        let item_path = item.path();

        let rel = item_path
            .strip_prefix(&base_path)
            .unwrap_or(&item_path)
            .to_string_lossy()
            .replace('\\', "/");

        if file_type.is_dir() {
            let count = fs::read_dir(&item_path).map(|r| r.count()).unwrap_or(0);
            entries.push(FileEntry {
                name: file_name,
                r#type: "folder".to_string(),
                path: rel,
                is_pdf: false,
                size_mb: "0.00".to_string(),
                item_count: count,
            });
        } else if file_type.is_file() {
            let is_pdf = file_name.to_lowercase().ends_with(".pdf");
            let size_mb = match item.metadata() {
                Ok(m) => format!("{:.2}", m.len() as f64 / (1024.0 * 1024.0)),
                Err(_) => "0.00".to_string(),
            };
            entries.push(FileEntry {
                name: file_name,
                r#type: "file".to_string(),
                path: rel,
                is_pdf,
                size_mb,
                item_count: 0,
            });
        }
    }

    // Sort folders first, then files
    entries.sort_by(|a, b| match (a.r#type.as_str(), b.r#type.as_str()) {
        ("folder", "file") => std::cmp::Ordering::Less,
        ("file", "folder") => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
fn search_documents(docs_dir: Option<String>, query: String) -> Result<Vec<SearchResult>, String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(Vec::new());
    }

    let base_path = get_effective_docs_dir(docs_dir);
    if !base_path.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    const MAX_RESULTS: usize = 50;

    for entry in WalkDir::new(&base_path).max_depth(5).into_iter().flatten() {
        if results.len() >= MAX_RESULTS {
            break;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.to_lowercase().contains(&q) {
            let rel = entry
                .path()
                .strip_prefix(&base_path)
                .unwrap_or_else(|_| entry.path())
                .to_string_lossy()
                .replace('\\', "/");

            let is_dir = entry.file_type().is_dir();
            let is_pdf = file_name.to_lowercase().ends_with(".pdf");

            results.push(SearchResult {
                name: file_name,
                r#type: if is_dir { "folder".to_string() } else { "file".to_string() },
                path: rel,
                is_pdf,
            });
        }
    }

    Ok(results)
}

// ─────────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS: HARDWARE PRINTING (Windows Spooler + Linux/macOS CUPS)
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_system_printers() -> Vec<String> {
    let mut printers = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name"])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() {
                        printers.push(trimmed.to_string());
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Linux and macOS CUPS lpstat
        let output = Command::new("lpstat").arg("-p").output();
        if let Ok(out) = output {
            if out.status.success() {
                let stdout = String::from_utf8_lossy(&out.stdout);
                for line in stdout.lines() {
                    // "printer PrinterName is idle..."
                    if let Some(name) = line.strip_prefix("printer ") {
                        if let Some(first_word) = name.split_whitespace().next() {
                            printers.push(first_word.to_string());
                        }
                    }
                }
            }
        }
    }

    printers
}

#[tauri::command]
fn print_document(file_path: String, printer: Option<String>, copies: Option<u32>) -> Result<String, String> {
    let num_copies = copies.unwrap_or(1);
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        // Try printing via SumatraPDF or PowerShell Spooler
        let mut cmd = Command::new("powershell");
        let script = match printer {
            Some(p) => format!(
                "Start-Process -FilePath '{}' -Verb PrintTo -ArgumentList '\"{}\"' -PassThru | ForEach-Object {{ Start-Sleep -Seconds 2 }}",
                file_path.replace('\'', "''"),
                p.replace('\'', "''")
            ),
            None => format!(
                "Start-Process -FilePath '{}' -Verb Print -PassThru | ForEach-Object {{ Start-Sleep -Seconds 2 }}",
                file_path.replace('\'', "''")
            ),
        };

        for _ in 0..num_copies {
            let res = cmd.args(["-NoProfile", "-Command", &script]).output();
            if let Err(e) = res {
                return Err(format!("Failed to execute print command: {}", e));
            }
        }
        Ok("Print job queued successfully".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Linux / macOS CUPS lp
        let mut cmd = Command::new("lp");
        if let Some(p) = printer {
            cmd.arg("-d").arg(p);
        }
        cmd.arg("-n").arg(num_copies.to_string());
        cmd.arg(&file_path);

        match cmd.output() {
            Ok(out) => {
                if out.status.success() {
                    Ok("Print job sent to CUPS daemon".to_string())
                } else {
                    Err(String::from_utf8_lossy(&out.stderr).to_string())
                }
            }
            Err(e) => Err(format!("CUPS lp command failed: {}", e)),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAURI COMMANDS: LAN & NETWORK DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_lan_info() -> LanInfo {
    let ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let port: u16 = 3000;
    let base_url = format!("http://{}:{}", ip, port);

    LanInfo { ip, port, base_url }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND NODE.JS SERVER MANAGER
// ─────────────────────────────────────────────────────────────────────────────

use std::sync::Mutex;
use std::process::Child;
use tauri::Manager;

struct NodeServerState(Mutex<Option<Child>>);

fn start_node_server() -> Option<Child> {
    let mut candidate_dirs = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        candidate_dirs.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            candidate_dirs.push(parent.to_path_buf());
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            candidate_dirs.push(parent.to_path_buf());
            if let Some(gp) = parent.parent() {
                candidate_dirs.push(gp.to_path_buf());
                if let Some(ggp) = gp.parent() {
                    candidate_dirs.push(ggp.to_path_buf());
                }
            }
        }
    }

    for dir in candidate_dirs {
        let server_js = dir.join("server.js");
        if server_js.exists() {
            #[cfg(target_os = "windows")]
            use std::os::windows::process::CommandExt;
            #[cfg(target_os = "windows")]
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let mut cmd = Command::new("node");
            cmd.arg("server.js").current_dir(&dir);
            #[cfg(target_os = "windows")]
            cmd.creation_flags(CREATE_NO_WINDOW);

            if let Ok(child) = cmd.spawn() {
                return Some(child);
            }
        }
    }
    None
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

fn main() {
    let server_child = start_node_server();

    tauri::Builder::default()
        .manage(NodeServerState(Mutex::new(server_child)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            list_documents,
            search_documents,
            get_system_printers,
            print_document,
            get_lan_info
        ])
        .build(tauri::generate_context!())
        .expect("error while building Millora desktop application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<NodeServerState>() {
                    if let Ok(mut lock) = state.0.lock() {
                        if let Some(mut child) = lock.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
