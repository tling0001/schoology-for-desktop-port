#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

const SEVENZIP_URL: &str = "https://github.com/ip7z/7zip/releases/download/26.04/7z2604-x64.msi";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Payload {
    #[serde(default)]
    url: String,
    size: Option<u64>,
    digest: Option<String>,
    version: Option<String>,
    product_name: Option<String>,
    install_dir: Option<String>,
    parent_pid: Option<u32>,
    staged_updater_path: Option<String>,
    staged_updater_loader_path: Option<String>,
    theme_mode: Option<String>,
    dark_theme: Option<bool>,
}

struct UpdateState {
    payload: Payload,
    cancelled: Arc<AtomicBool>,
}

fn read_payload() -> Payload {
    let encoded = env::args()
        .find_map(|arg| arg.strip_prefix("--payload-base64=").map(str::to_owned))
        .unwrap_or_default();
    STANDARD
        .decode(encoded)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn emit_progress(
    app: &AppHandle,
    id: &str,
    state: &str,
    text: &str,
    percent: Option<u8>,
    status: &str,
) {
    let _ = app.emit(
        "updater-progress",
        json!({
            "id": id,
            "state": state,
            "text": text,
            "percent": percent,
            "status": status
        }),
    );
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), String> {
    if cancelled.load(Ordering::Relaxed) {
        Err("Update cancelled.".into())
    } else {
        Ok(())
    }
}

async fn download_file(
    app: &AppHandle,
    url: &str,
    target: &Path,
    step_id: &str,
    status_text: &str,
    expected_size: Option<u64>,
    cancelled: &AtomicBool,
) -> Result<u64, String> {
    check_cancelled(cancelled)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(8))
        .timeout(Duration::from_secs(15 * 60))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client
        .get(url)
        .header("User-Agent", "Schoology-Updater-Tauri/1.0")
        .header("Accept", "application/octet-stream")
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download failed (HTTP {}).", response.status().as_u16()));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let total = response.content_length().or(expected_size).unwrap_or(0);
    let mut output = fs::File::create(target).map_err(|e| e.to_string())?;
    let mut received = 0_u64;
    emit_progress(app, step_id, "determinate", "Downloading…", Some(0), status_text);
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Download interrupted: {e}"))? {
        check_cancelled(cancelled)?;
        output.write_all(&chunk).map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        let percent = if total > 0 {
            Some(((received.saturating_mul(100) / total).min(100)) as u8)
        } else {
            None
        };
        emit_progress(
            app,
            step_id,
            "determinate",
            &percent.map(|p| format!("{p}%")).unwrap_or_else(|| "Downloading…".into()),
            percent,
            status_text,
        );
    }
    output.flush().map_err(|e| e.to_string())?;
    if total > 0 && received != total {
        let _ = fs::remove_file(target);
        return Err(format!("Download was incomplete ({received}/{total} bytes)."));
    }
    emit_progress(app, step_id, "done", "Complete", Some(100), status_text);
    Ok(received)
}

fn find_7zip(install_dir: &Path) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    for name in ["7z.exe", "7zz.exe", "7zg.exe"] {
        candidates.push(install_dir.join("7-Zip").join(name));
        if let Some(program_files) = env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(program_files).join("7-Zip").join(name));
        }
        for dir in env::split_paths(&env::var_os("PATH").unwrap_or_default()) {
            candidates.push(dir.join(name));
        }
    }
    candidates.into_iter().find(|path| path.is_file())
}

fn run_command(command: &mut Command, label: &str) -> Result<(), String> {
    let output = command
        .output()
        .map_err(|e| format!("Could not start {label}: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "{label} failed ({}): {}",
            output.status,
            stderr.trim().chars().take(500).collect::<String>()
        ))
    }
}

fn wait_for_parent(pid: u32, cancelled: &AtomicBool) -> Result<(), String> {
    if pid == 0 {
        return Ok(());
    }
    let started = SystemTime::now();
    loop {
        check_cancelled(cancelled)?;
        let output = Command::new("tasklist.exe")
            .args(["/FI", &format!("PID eq {pid}")])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output();
        match output {
            Ok(result) if result.status.success() => {
                let text = String::from_utf8_lossy(&result.stdout);
                let present = text.contains(&pid.to_string()) && !text.contains("No tasks are running");
                if !present {
                    return Ok(());
                }
            }
            Ok(_) | Err(_) => {
                if started.elapsed().unwrap_or_default() > Duration::from_secs(15) {
                    return Err("Could not verify that Schoology has exited. Close Schoology and retry.".into());
                }
            }
        }
        if started.elapsed().unwrap_or_default() > Duration::from_secs(18) {
            return Err("Schoology is still running. Close Schoology and retry the update.".into());
        }
        thread::sleep(Duration::from_millis(300));
    }
}

fn schedule_cleanup(staged_updater: &Path, staged_loader: Option<&Path>, run_dir: &Path) {
    let pid = std::process::id();
    let quote = |value: &str| format!("'{}'", value.replace('\'', "''"));
    let mut cleanup_paths = vec![quote(&staged_updater.to_string_lossy())];
    if let Some(loader) = staged_loader {
        cleanup_paths.push(quote(&loader.to_string_lossy()));
    }
    let cleanup = cleanup_paths.iter().map(|path| format!("Remove-Item -LiteralPath {path} -Force -ErrorAction SilentlyContinue")).collect::<Vec<_>>().join("; ");
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; $p={pid}; while(Get-Process -Id $p -ErrorAction SilentlyContinue){{Start-Sleep -Milliseconds 250}}; {cleanup}; Remove-Item -LiteralPath {} -Recurse -Force -ErrorAction SilentlyContinue",
        quote(&run_dir.to_string_lossy())
    );
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let encoded = STANDARD.encode(bytes);
    let _ = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", &encoded])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

async fn run_update(
    app: &AppHandle,
    payload: &Payload,
    cancelled: &AtomicBool,
) -> Result<(), String> {
    if payload.url.is_empty() {
        return Err("The update download URL is missing.".into());
    }
    let fallback = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("Programs")
        .join("Schoology");
    let install_dir = payload
        .install_dir
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or(fallback);
    let schoology_exe = install_dir.join("schoology-desktop-port.exe");
    let temp_root = env::temp_dir().join("schoology-updater");
    fs::create_dir_all(&temp_root).map_err(|e| e.to_string())?;
    let run_dir = temp_root.join(format!(
        "run-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
    ));
    fs::create_dir_all(&run_dir).map_err(|e| e.to_string())?;
    let seven_msi = run_dir.join("7z2604-x64.msi");
    let installer = run_dir.join("schoology-installer.exe");
    let extracted = run_dir.join("installer-outer");

    let seven = if let Some(path) = find_7zip(&install_dir) {
        // Skip the 7-Zip progress screens when a usable extractor is already present.
        path
    } else {
        download_file(
            app,
            SEVENZIP_URL,
            &seven_msi,
            "sevenDownload",
            "Downloading 7-Zip…",
            None,
            cancelled,
        )
        .await?;
        emit_progress(app, "sevenInstall", "indeterminate", "Installing…", None, "Installing 7-Zip…");
        let local_7zip = install_dir.join("7-Zip");
        fs::create_dir_all(&local_7zip).map_err(|e| e.to_string())?;
        run_command(
            Command::new("msiexec.exe")
                .args(["/a"])
                .arg(&seven_msi)
                .args(["/qb"])
                .arg(format!("TARGETDIR={}", local_7zip.display())),
            "7-Zip extraction",
        )?;
        let path = find_7zip(&install_dir)
            .ok_or("7-Zip extraction finished but no console extractor was found.")?;
        emit_progress(app, "sevenInstall", "done", "Complete", Some(100), "Installing 7-Zip…");
        path
    };

    emit_progress(app, "schoologyDownload", "determinate", "Starting…", Some(0), "Downloading Schoology…");
    let downloaded_size = download_file(
        app,
        &payload.url,
        &installer,
        "schoologyDownload",
        "Downloading Schoology…",
        payload.size,
        cancelled,
    )
    .await?;
    if let Some(expected) = payload.size.filter(|size| *size > 0) {
        if downloaded_size != expected {
            return Err("The downloaded Schoology installer size does not match the release metadata.".into());
        }
    }
    if let Some(expected) = payload.digest.as_deref().and_then(|value| value.strip_prefix("sha256:")) {
        let mut input = fs::File::open(&installer).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let count = input.read(&mut buffer).map_err(|e| e.to_string())?;
            if count == 0 { break; }
            hasher.update(&buffer[..count]);
        }
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = fs::remove_file(&installer);
            return Err("The downloaded Schoology installer failed its SHA-256 integrity check.".into());
        }
    }

    emit_progress(app, "install", "indeterminate", "Waiting for Schoology to close…", None, "Preparing installation…");
    wait_for_parent(payload.parent_pid.unwrap_or(0), cancelled)?;
    check_cancelled(cancelled)?;
    fs::create_dir_all(&extracted).map_err(|e| e.to_string())?;
    emit_progress(app, "install", "determinate", "Extracting installer…", Some(15), "Installing Schoology…");
    run_command(
        Command::new(&seven)
            .arg("x")
            .arg(&installer)
            .arg(format!("-o{}", extracted.display()))
            .arg("-y"),
        "Schoology installer extraction",
    )?;
    check_cancelled(cancelled)?;
    if !extracted.join("schoology-desktop-port.exe").is_file() {
        return Err("The installer did not contain schoology-desktop-port.exe at its root. The installed app was left unchanged.".into());
    }

    fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;
    emit_progress(app, "install", "determinate", "Replacing application files…", Some(55), "Installing Schoology…");
    for entry in fs::read_dir(&install_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_file() || kind.is_symlink() {
            fs::remove_file(entry.path()).map_err(|e| format!("Could not replace {}: {e}", entry.path().display()))?;
        }
    }
    emit_progress(app, "install", "determinate", "Copying application files…", Some(75), "Installing Schoology…");
    let result = Command::new("robocopy.exe")
        .arg(&extracted)
        .arg(&install_dir)
        .args(["/E", "/R:2", "/W:1"])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Could not copy updated application files: {e}"))?;
    let code = result.status.code().unwrap_or(16);
    if code > 7 {
        return Err(format!("Copying updated application files failed (robocopy exit code {code})."));
    }
    if !schoology_exe.is_file() {
        return Err("The update copy finished, but schoology-desktop-port.exe is missing. Schoology was not relaunched.".into());
    }
    emit_progress(app, "install", "done", "Complete", Some(100), "Update complete. Restarting Schoology…");
    let _ = fs::remove_file(&installer);
    let _ = fs::remove_file(&seven_msi);
    let staged_updater = payload
        .staged_updater_path
        .as_deref()
        .map(PathBuf::from)
        .or_else(|| env::current_exe().ok())
        .unwrap_or_else(|| temp_root.join("SchoologyUpdater.exe"));
    Command::new(&schoology_exe)
        .current_dir(&install_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("The update completed, but Schoology could not be relaunched: {e}"))?;
    let staged_loader = payload.staged_updater_loader_path.as_deref().map(PathBuf::from);
    schedule_cleanup(&staged_updater, staged_loader.as_deref(), &run_dir);
    Ok(())
}

#[tauri::command]
fn get_update_payload(state: State<'_, UpdateState>) -> Value {
    serde_json::to_value(&state.payload).unwrap_or_else(|_| json!({}))
}

#[tauri::command]
async fn start_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    let payload = state.payload.clone();
    let cancelled = state.cancelled.clone();
    match run_update(&app, &payload, &cancelled).await {
        Ok(()) => {
            app.exit(0);
            Ok(())
        }
        Err(error) => {
            let _ = app.emit("updater-progress", json!({"id":"install","state":"error","text":"Failed","error":error,"status":"Update failed."}));
            Err(error)
        }
    }
}

#[tauri::command]
fn cancel_update(state: State<'_, UpdateState>) {
    state.cancelled.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn close_updater(app: AppHandle) {
    app.exit(0);
}

fn main() {
    let state = UpdateState {
        payload: read_payload(),
        cancelled: Arc::new(AtomicBool::new(false)),
    };
    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_update_payload,
            start_update,
            cancel_update,
            close_updater
        ])
        .run(tauri::generate_context!())
        .expect("error while running Schoology Updater");
}
