use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use hmac::{Hmac, Mac};
use md5::Md5;
use rand::RngCore;
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::{Path, PathBuf}, process::{Command, Stdio}, sync::{Mutex, atomic::{AtomicBool, AtomicU64, Ordering}}, time::{SystemTime, UNIX_EPOCH}};
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::webview::{DownloadEvent, NewWindowResponse, PermissionKind, PermissionResponse, WebviewBuilder};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{LogicalPosition, LogicalSize, WebviewUrl};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_notification::NotificationExt;
use url::Url;
use tokio::sync::oneshot;

type HmacSha1 = Hmac<Sha1>;
static CANADIAN_INSTANCE: AtomicBool = AtomicBool::new(false);
fn api_host() -> &'static str { if CANADIAN_INSTANCE.load(Ordering::Relaxed) { "api.schoologyca.com" } else { "api.schoology.com" } }
fn web_host() -> &'static str { if CANADIAN_INSTANCE.load(Ordering::Relaxed) { "app.schoologyca.com" } else { "app.schoology.com" } }
const CONSUMER_KEY: &str = "998121f221d5dc0f4956ee6946d27d5e04e55635e";
const CONSUMER_SECRET: &str = "5cff9d3780d64695d762ba8e05a34e9e";
const MOBILE_COOKIE: &str = "s_mobile=03447c0175ac0c7299a5508fde9569fc";
const ANDROID_UA: &str = "okhttp/4.8.0";
const APP_VERSION: &str = env!("SCHOOLGY_APP_VERSION");

struct PendingLogin {
    request_token: String,
    credential: Value,
    reply: oneshot::Sender<Result<Value, String>>,
}
#[derive(Default)]
struct HostState {
    server_time_offset: Mutex<i64>,
    pending_login: Mutex<Option<PendingLogin>>,
    renderer_ready: Mutex<bool>,
    pending_deep_link: Mutex<Option<String>>,
}

fn app_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(name);
    Ok(path)
}
fn read_json(app: &AppHandle, name: &str, default: Value) -> Value {
    app_file(app, name).ok().and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok()).unwrap_or(default)
}
fn write_json(app: &AppHandle, name: &str, value: &Value) -> Result<(), String> {
    let path = app_file(app, name)?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    if path.exists() {
        let backup = path.with_extension("json.bak");
        if backup.exists() { fs::remove_file(&backup).map_err(|e| e.to_string())?; }
        fs::rename(&path, &backup).map_err(|e| e.to_string())?;
        match fs::rename(&temporary, &path) {
            Ok(()) => { let _ = fs::remove_file(backup); Ok(()) }
            Err(error) => { let _ = fs::rename(backup, &path); let _ = fs::remove_file(&temporary); Err(error.to_string()) }
        }
    } else {
        fs::rename(temporary, path).map_err(|e| e.to_string())
    }
}
fn valid_auth(value: &Value) -> bool {
    value.get("oauth_token").and_then(Value::as_str).is_some_and(|token| !token.is_empty())
        && value.get("oauth_token_secret").and_then(Value::as_str).is_some_and(|secret| !secret.is_empty())
}
fn auth_state(app: &AppHandle) -> Option<Value> {
    let current_path = app_file(app, "auth.json").ok()?;
    if let Ok(text) = fs::read_to_string(&current_path) {
        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            if valid_auth(&value) { return Some(value); }
        }
    }

    // Electron stored credentials in %APPDATA%/Schoology/auth.json (and in the
    // older app-specific userData directory). Migrate them when Tauri takes over.
    let app_data = app.path().app_data_dir().ok()?;
    let parent = app_data.parent()?;
    let candidates = [
        parent.join("Schoology").join("auth.json"),
        parent.join("schoology-desktop-port").join("auth.json"),
        parent.join("Schoology Desktop Port").join("auth.json"),
    ];
    for candidate in candidates {
        let Ok(text) = fs::read_to_string(&candidate) else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
        if valid_auth(&value) {
            let _ = write_json(app, "auth.json", &value);
            return Some(value);
        }
    }
    None
}
fn epoch() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64 }
static NONCE_COUNTER: AtomicU64 = AtomicU64::new(0);
fn random_nonce() -> String { let mut bytes = [0u8; 16]; rand::thread_rng().fill_bytes(&mut bytes); let random = u128::from_be_bytes(bytes); let sequence = NONCE_COUNTER.fetch_add(1, Ordering::Relaxed); format!("{random:032x}{sequence:016x}") }
// Match Java URLEncoder used by the official Schoology Android OAuth signer.
// Spaces become '+', '*' remains literal, and '~' is percent-encoded.
fn enc(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => out.push(*byte as char),
            b'*' => out.push('*'), b' ' => out.push('+'),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}
fn parse_form(input: &str) -> Value {
    let mut map = serde_json::Map::new();
    for (key, value) in url::form_urlencoded::parse(input.as_bytes()) { map.insert(key.into_owned(), Value::String(value.into_owned())); }
    Value::Object(map)
}
fn form_value(value: &Value) -> String {
    let Some(object) = value.as_object() else { return String::new() };
    url::form_urlencoded::Serializer::new(String::new()).extend_pairs(object.iter().map(|(k,v)| (k.as_str(), match v { Value::String(s) => s.clone(), _ => v.to_string() }))).finish()
}
fn signed_header(method: &str, url: &Url, token: &str, secret: &str, timestamp: i64, extra: &[(&str, String)]) -> Result<String, String> {
    let mut oauth = vec![
        ("oauth_consumer_key".to_owned(), CONSUMER_KEY.to_owned()),
        ("oauth_nonce".to_owned(), random_nonce()),
        ("oauth_signature_method".to_owned(), "HMAC-SHA1".to_owned()),
        ("oauth_timestamp".to_owned(), timestamp.to_string()),
        ("oauth_version".to_owned(), "1.0".to_owned()),
        ("oauth_token".to_owned(), token.to_owned()),
    ];
    let mut pairs: Vec<(String, String)> = url.query_pairs().map(|(k,v)| (k.into_owned(),v.into_owned())).collect();
    pairs.extend(oauth.iter().cloned());
    pairs.extend(extra.iter().map(|(k,v)| ((*k).to_owned(),v.clone())));
    // The official Android signer sorts decoded parameter names and then values,
    // and URL-encodes the complete normalized string rather than each pair.
    pairs.sort_by(|a,b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    let normalized = pairs.iter().map(|(k,v)| format!("{}={}",k,v)).collect::<Vec<_>>().join("&");
    let base = format!("{}&{}&{}", method.to_uppercase(), enc(&format!("{}://{}{}",url.scheme(),url.host_str().unwrap_or_default(),url.path())), enc(&normalized));
    let mut mac = HmacSha1::new_from_slice(format!("{CONSUMER_SECRET}&{secret}").as_bytes()).map_err(|e| e.to_string())?;
    mac.update(base.as_bytes());
    let signature = BASE64.encode(mac.finalize().into_bytes());
    oauth.sort_by(|a,b| a.0.cmp(&b.0));
    let fields = ["oauth_consumer_key", "oauth_token", "oauth_nonce", "oauth_timestamp", "oauth_signature_method", "oauth_version"];
    let mut header = String::from("OAuth ");
    for key in fields { if let Some((_,value)) = oauth.iter().find(|(k,_)| k == key) { if header.len() > 6 { header.push_str(", "); } header.push_str(&format!("{key}=\"{}\"", value)); } }
    header.push_str(&format!(", oauth_signature=\"{}\"", enc(&signature)));
    Ok(header)
}
fn plaintext_header(token: &str, secret: &str, timestamp: i64) -> String {
    format!("OAuth oauth_consumer_key=\"{CONSUMER_KEY}\", oauth_nonce=\"{}\", oauth_signature_method=\"PLAINTEXT\", oauth_timestamp=\"{timestamp}\", oauth_token=\"{}\", oauth_signature=\"{CONSUMER_SECRET}%26{}\"", random_nonce(), token, secret)
}
async fn request(method: &str, url: Url, body: Option<Value>, auth: Option<&Value>, state: &HostState, client_identity: bool, qr: Option<&str>, plaintext: bool) -> Result<reqwest::Response, String> {
    // Do not let reqwest replay the same OAuth Authorization header across redirects.
    // Schoology's Android interceptor signs each redirected request independently.
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(45)).build().map_err(|e| e.to_string())?;
    let mut current_url = url;
    let mut current_method = method.to_uppercase();
    let mut current_body = body;
    for redirect_count in 0..=5 {
        let timestamp = epoch() + *state.server_time_offset.lock().map_err(|e| e.to_string())?;
        let current_is_api_host = current_url.host_str().is_some_and(|host| host.eq_ignore_ascii_case(api_host()));
        let mut builder = client.request(current_method.parse::<reqwest::Method>().map_err(|e| e.to_string())?, current_url.clone()).header("User-Agent", ANDROID_UA).header("Accept", "application/json");
        if client_identity && current_is_api_host { builder = builder.header("X-Schoology-Client", "Android").header("X-Schoology-App-Version", "2026.06.0"); }
        if let Some(a) = auth.filter(|_| current_is_api_host) {
            let token = a.get("oauth_token").and_then(Value::as_str).unwrap_or("");
            let secret = a.get("oauth_token_secret").and_then(Value::as_str).unwrap_or("");
            let qr_parameters = qr.map(|value| vec![("scanned_qr_data", enc(value))]).unwrap_or_default();
            let header = if plaintext { plaintext_header(token, secret, timestamp) } else { signed_header(&current_method, &current_url, token, secret, timestamp, &qr_parameters)? };
            builder = builder.header("Authorization", header).header("Cookie", MOBILE_COOKIE);
        }
        if let Some(value) = current_body.clone() {
            if !current_method.eq_ignore_ascii_case("GET") && !current_method.eq_ignore_ascii_case("HEAD") {
                builder = builder.header("Content-Type", "application/x-www-form-urlencoded").body(form_value(&value));
            }
        }
        let response = builder.send().await.map_err(|e| format!("Schoology request failed: {e}"))?;
        if response.status().is_redirection() && redirect_count < 5 {
            if let Some(location) = response.headers().get("location").and_then(|value| value.to_str().ok()) {
                if let Ok(next_url) = current_url.join(location) {
                    // Never forward a Schoology credential to a different host or scheme.
                    let safe_api_redirect = next_url.scheme() == "https" && next_url.host_str().is_some_and(|host| host.eq_ignore_ascii_case(api_host()));
                    if safe_api_redirect {
                        let status = response.status();
                        if status == reqwest::StatusCode::SEE_OTHER
                            || ((status == reqwest::StatusCode::FOUND || status == reqwest::StatusCode::MOVED_PERMANENTLY || status == reqwest::StatusCode::TEMPORARY_REDIRECT) && !current_method.eq_ignore_ascii_case("GET") && !current_method.eq_ignore_ascii_case("HEAD")) {
                            if status != reqwest::StatusCode::TEMPORARY_REDIRECT {
                                current_method = "GET".into();
                                current_body = None;
                            }
                        }
                        current_url = next_url;
                        continue;
                    }
                }
            }
        }
        return Ok(response);
    }
    Err("Schoology request exceeded the redirect limit.".into())
}
async fn response_value(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("Schoology API {}: {}", status.as_u16(), text.chars().take(700).collect::<String>())); }
    Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
}
async fn sync_server_time(state: &HostState) {
    if let Ok(url) = Url::parse(&format!("https://{}/oauth/timestamp", web_host())) {
        if let Ok(client) = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build() {
            if let Ok(response) = client.get(url).send().await { if let Ok(text) = response.text().await { if let Ok(server) = text.trim().parse::<i64>() { if let Ok(mut offset) = state.server_time_offset.lock() { *offset = server - epoch(); } } } }
        }
    }
}
async fn request_token(state: &HostState) -> Result<Value, String> {
    let url = Url::parse(&format!("https://{}/v1/oauth/request_token", api_host())).map_err(|e| e.to_string())?;
    let response = request("GET", url, None, Some(&json!({"oauth_token":"", "oauth_token_secret":""})), state, false, None, false).await?;
    let text = response.text().await.map_err(|e| e.to_string())?;
    if text.is_empty() { return Err("Schoology returned an empty request token.".into()); }
    Ok(parse_form(&text))
}
async fn exchange_token(app: &AppHandle, state: &HostState, temporary: &Value) -> Result<Value, String> {
    let url = Url::parse(&format!("https://{}/v1/oauth/access_token", api_host())).map_err(|e| e.to_string())?;
    let response = request("GET", url, None, Some(temporary), state, true, None, false).await?;
    let status = response.status();
    let response_text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Schoology access-token exchange failed (HTTP {}): {}", status.as_u16(), response_text.chars().take(500).collect::<String>()));
    }
    let token_response = parse_form(&response_text);
    let token = token_response.get("oauth_token").and_then(Value::as_str).unwrap_or("");
    let secret = token_response.get("oauth_token_secret").and_then(Value::as_str).unwrap_or("");
    if token.is_empty() || secret.is_empty() {
        let detail = response_text.chars().take(500).collect::<String>();
        return Err(if detail.is_empty() {
            "Schoology returned an invalid access token (the response did not contain an access token or secret).".into()
        } else {
            format!("Schoology returned an invalid access token: {detail}")
        });
    }
    let auth = json!({"oauth_token":token,"oauth_token_secret":secret});
    let url = Url::parse(&format!("https://{}/v1/users/me", api_host())).map_err(|e| e.to_string())?;
    let user_response = request("GET", url, None, Some(&auth), state, true, None, false).await?;
    let user = response_value(user_response).await?;
    let user_id = user.get("id").and_then(Value::as_i64).filter(|id| *id > 0).ok_or("Schoology did not return a valid user profile. Please try signing in again.")?;
    let complete = json!({"oauth_token":token,"oauth_token_secret":secret,"createdAt":epoch()*1000,"userId":user_id,"user":user});
    write_json(app, "auth.json", &complete)?;
    Ok(complete)
}
async fn login_credentials(app: &AppHandle, state: &HostState, args: &Value) -> Result<Value, String> {
    sync_server_time(state).await;
    let temporary = request_token(state).await?;
    let mut form = serde_json::Map::new();
    form.insert("user".into(), args.get("user").cloned().unwrap_or(Value::String(String::new())));
    form.insert("password".into(), args.get("password").cloned().unwrap_or(Value::String(String::new())));
    form.insert("oauth_token".into(), temporary.get("oauth_token").cloned().unwrap_or(Value::Null));
    if let Some(id) = args.get("schoolId").filter(|v| !v.is_null() && !v.as_str().unwrap_or("").is_empty()) { form.insert("school_id".into(), id.clone()); }
    let url = Url::parse(&format!("https://{}/oauth/authorize_auto", web_host())).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(45)).build().map_err(|e| e.to_string())?;
    let response = client.post(url).header("User-Agent", ANDROID_UA).header("X-Schoology-Client", "Android").header("X-Schoology-App-Version", "2026.06.0").form(&form).send().await.map_err(|e| e.to_string())?;
    let status = response.status(); let text = response.text().await.unwrap_or_default();
    if !status.is_success() { return Err(format!("Schoology rejected login: {} {}", status.as_u16(), text.chars().take(700).collect::<String>())); }
    exchange_token(app, state, &temporary).await
}
async fn login_qr(app: &AppHandle, state: &HostState, qr: &str) -> Result<Value, String> {
    sync_server_time(state).await;
    let temporary = request_token(state).await?;
    let mut form = serde_json::Map::new(); form.insert("scanned_qr_data".into(), json!(qr)); form.insert("oauth_token".into(), temporary.get("oauth_token").cloned().unwrap_or(Value::Null));
    let url = Url::parse(&format!("https://{}/oauth/qr_code_authorize_auto", web_host())).map_err(|e| e.to_string())?;
    let response = request("POST", url, Some(Value::Object(form)), Some(&temporary), state, true, Some(qr), false).await?;
    if !response.status().is_success() { let status=response.status().as_u16(); let text=response.text().await.unwrap_or_default(); return Err(format!("QR authorization failed: {status} {text}")); }
    exchange_token(app, state, &temporary).await
}

fn build_browser_login_url(domain: &str, request_token: &str) -> Result<String, String> {
    let raw = domain.trim();
    let with_scheme = if raw.contains("://") { raw.to_owned() } else { format!("https://{raw}") };
    let parsed = Url::parse(&with_scheme).map_err(|_| "This school did not provide a valid login domain.")?;
    if !["https", "http"].contains(&parsed.scheme()) || parsed.host_str().is_none() { return Err("This school did not provide a valid login domain.".into()); }
    let host = parsed.host_str().unwrap_or_default();
    let callback = format!("https://{host}/mobile_login_success?os=android&os_version=34&app_version=600000477");
    let oauth_path = format!("oauth/authorize?oauth_token={request_token}&oauth_callback={}", url::form_urlencoded::byte_serialize(callback.as_bytes()).collect::<String>());
    let landing = url::form_urlencoded::byte_serialize(oauth_path.as_bytes()).collect::<String>();
    Ok(format!("https://{host}/{oauth_path}&login_landing_dest={landing}"))
}
async fn login_school_browser(app: &AppHandle, state: &HostState, info: &Value) -> Result<Value, String> {
    let domain = info.get("domain").and_then(Value::as_str).ok_or("This school did not provide a login domain.")?;
    sync_server_time(state).await;
    let credential = request_token(state).await?;
    let token = credential.get("oauth_token").and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or("Schoology did not return a request token.")?.to_owned();
    let url = build_browser_login_url(domain, &token)?;
    let (sender, receiver) = oneshot::channel();
    {
        let mut pending = state.pending_login.lock().map_err(|e| e.to_string())?;
        if pending.is_some() { return Err("A school sign-in is already waiting for a browser callback.".into()); }
        *pending = Some(PendingLogin { request_token: token.clone(), credential, reply: sender });
    }
    if let Err(error) = app.opener().open_url(&url, None::<&str>) {
        if let Ok(mut pending) = state.pending_login.lock() {
            if pending.as_ref().is_some_and(|p| p.request_token == token) { *pending = None; }
        }
        return Err(format!("Could not open the default browser for school sign-in: {error}"));
    }
    match tokio::time::timeout(std::time::Duration::from_secs(600), receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("School sign-in was interrupted before the browser callback completed.".into()),
        Err(_) => {
            if let Ok(mut pending) = state.pending_login.lock() {
                if pending.as_ref().is_some_and(|p| p.request_token == token) { *pending = None; }
            }
            Err("Timed out waiting for school sign-in. Finish signing in in your browser and return to Schoology.".into())
        }
    }
}
async fn handle_deep_link(app: AppHandle, url_text: String) {
    let parsed = match Url::parse(&url_text) { Ok(url) => url, Err(_) => return };
    if parsed.scheme() == "schoology" && parsed.host_str().unwrap_or_default().eq_ignore_ascii_case("external_login_callback") {
        let received = parsed.query_pairs().find(|(key, _)| key == "request_token").map(|(_, value)| value.into_owned()).unwrap_or_default();
        let state = app.state::<HostState>();
        let pending = {
            let mut guard = match state.pending_login.lock() { Ok(guard) => guard, Err(_) => return };
            if guard.as_ref().is_some_and(|p| !received.is_empty() && p.request_token == received) { guard.take() } else { None }
        };
        if let Some(pending) = pending {
            let result = exchange_token(&app, &state, &pending.credential).await;
            let _ = pending.reply.send(result);
        }
        return;
    }
    let state = app.state::<HostState>();
    let ready = state.renderer_ready.lock().map(|value| *value).unwrap_or(false);
    if ready { let _ = app.emit("schoology-deep-link", url_text); }
    else if let Ok(mut pending) = state.pending_deep_link.lock() { *pending = Some(url_text); }
}

async fn api_call(app: &AppHandle, state: &HostState, args: &Value) -> Result<Value, String> {
    let path = args.get("path").and_then(Value::as_str).unwrap_or("");
    let mut url = schoology_api_url(path)?;
    let method = args.get("method").and_then(Value::as_str).unwrap_or("GET").to_uppercase();
    let params = args.get("params").cloned().unwrap_or_else(|| json!({}));
    let is_multioptions = path.trim().trim_start_matches('/') == "multioptions" && method == "POST";
    if method == "GET" {
        if let Some(object) = params.as_object() {
            for (key, value) in object { url.query_pairs_mut().append_pair(key, if value.is_string() { value.as_str().unwrap_or("").to_owned() } else { value.to_string() }.as_str()); }
        }
        api_json(app, state, &method, url, None, false).await
    } else {
        api_json(app, state, &method, url, Some(params), is_multioptions || args.get("json").and_then(Value::as_bool).unwrap_or(false)).await
    }
}

async fn fetch_image(app: &AppHandle, state: &HostState, raw: &str) -> Result<Value, String> {
    let Some(auth) = auth_state(app) else { return Ok(Value::Null) };
    let url = Url::parse(raw).or_else(|_| Url::parse(&format!("https://{}/{}", web_host(), raw.trim_start_matches('/')))).map_err(|_| "Invalid image URL.".to_string())?;
    if !["https", "http"].contains(&url.scheme()) { return Ok(Value::Null); }
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(6)).timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?;
    let mut request = client.get(url.clone()).header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36").header("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8").header("Referer", format!("https://{}/", web_host()));
    if url.host_str() == Some(api_host()) {
        request = request.header("Authorization", signed_header("GET", &url, auth["oauth_token"].as_str().unwrap_or(""), auth["oauth_token_secret"].as_str().unwrap_or(""), epoch() + *state.server_time_offset.lock().map_err(|e| e.to_string())?, &[])?);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Ok(Value::Null); }
    let mime = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("image/png").split(';').next().unwrap_or("image/png").to_owned();
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 12 * 1024 * 1024 { return Err("Schoology image is too large to display.".into()); }
    Ok(json!(format!("data:{mime};base64,{}", BASE64.encode(bytes))))
}
async fn api_json(app: &AppHandle, state: &HostState, method: &str, url: Url, body: Option<Value>, json_body: bool) -> Result<Value, String> {
    let auth = auth_state(app).ok_or("Not signed in")?;
    let timestamp = epoch() + *state.server_time_offset.lock().map_err(|e| e.to_string())?;
    let header = signed_header(method, &url, auth["oauth_token"].as_str().unwrap_or(""), auth["oauth_token_secret"].as_str().unwrap_or(""), timestamp, &[])?;
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(6)).timeout(std::time::Duration::from_secs(90)).build().map_err(|e| e.to_string())?;
    let mut request = client.request(method.parse::<reqwest::Method>().map_err(|e| e.to_string())?, url).header("User-Agent", ANDROID_UA).header("Accept", "application/json").header("X-Schoology-Client", "Android").header("X-Schoology-App-Version", "2026.06.0").header("Authorization", header).header("Cookie", MOBILE_COOKIE);
    if let Some(value) = body {
        if json_body { request = request.json(&value); }
        else { request = request.header("Content-Type", "application/x-www-form-urlencoded").body(form_value(&value)); }
    }
    response_value(request.send().await.map_err(|e| e.to_string())?).await
}
async fn submit_assignment_text(app: &AppHandle, state: &HostState, info: &Value) -> Result<Value, String> {
    let section = info.get("sectionId").and_then(Value::as_i64).ok_or("Text submission information is incomplete.")?;
    let grade = info.get("gradeItemId").and_then(Value::as_i64).ok_or("Text submission information is incomplete.")?;
    let text = info.get("text").and_then(Value::as_str).unwrap_or("").trim();
    if text.is_empty() { return Err("Enter a submission before posting.".into()); }
    let mut url = Url::parse(&format!("https://{}/v1/sections/{section}/submissions/{grade}/create", api_host())).map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("realm", "sections").append_pair("realm_id", &section.to_string()).append_pair("grade_item_id", &grade.to_string()).append_pair("action", "create");
    let body = json!({"body":text,"draft":if info.get("draft").and_then(Value::as_bool).unwrap_or(false) {1} else {0}});
    api_json(app, state, "POST", url, Some(body), true).await?;
    Ok(json!(true))
}
async fn submit_assignment_resource(app: &AppHandle, state: &HostState, info: &Value) -> Result<Value, String> {
    let section = info.get("sectionId").and_then(Value::as_i64).ok_or("Resource submission information is incomplete.")?;
    let assignment = info.get("assignmentId").and_then(Value::as_i64).ok_or("Resource submission information is incomplete.")?;
    let resource = info.get("resourceId").ok_or("Resource submission information is incomplete.")?;
    let url = Url::parse(&format!("https://{}/v1/course/{section}/materials/assignments/{assignment}/dropbox/create_resource_submission", api_host())).map_err(|e| e.to_string())?;
    api_json(app, state, "POST", url, Some(json!({"files":[{"schoology_resource_id":resource.to_string()}]})), true).await?;
    Ok(json!(true))
}
async fn launch_course_app(app: &AppHandle, state: &HostState, info: &Value) -> Result<Value, String> {
    let section = info.get("sectionId").or(info.get("section_id")).and_then(Value::as_i64).unwrap_or(0);
    let app_id = info.get("appId").or(info.get("app_id")).and_then(Value::as_i64).unwrap_or(0);
    let raw = info.get("launchUrl").or(info.get("href")).and_then(Value::as_str).unwrap_or("").trim();
    let (url, resource) = if !raw.is_empty() {
        let candidate = Url::parse(raw).map_err(|_| "Schoology returned an invalid course-app launch link.")?;
        if candidate.scheme() != "https" || candidate.host_str() != Some(api_host()) || !candidate.path().starts_with("/v2/sections/") && !candidate.path().starts_with("/v2/resources/applications/") { return Err("Schoology returned an unsupported course-app launch link.".into()); }
        (candidate, raw.contains("/v2/resources/applications/"))
    } else if section > 0 && app_id > 0 { (Url::parse(&format!("https://{}/v2/sections/{section}/applications/{app_id}/launch", api_host())).map_err(|e| e.to_string())?, false) }
    else if app_id > 0 { (Url::parse(&format!("https://{}/v2/resources/applications/{app_id}/launch", api_host())).map_err(|e| e.to_string())?, true) }
    else { return Err("The course app did not provide a valid launch link.".into()); };
    api_json(app, state, "GET", url, None, false).await.map_err(|e| if resource { format!("Resource app launch failed: {e}") } else { format!("Course app launch failed: {e}") })
}
#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn create_embedded_webview(app: &AppHandle, info: &Value) -> Result<Value, String> {
    let label = info.get("label").and_then(Value::as_str).ok_or("Embedded webview label is missing.")?.to_owned();
    if !label.starts_with("schoology-embedded-") || !label.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '/')) {
        return Err("Embedded webview label is not valid.".into());
    }
    if app.get_webview(&label).is_some() { return Err("An embedded webview with this label already exists.".into()); }
    let raw_url = info.get("url").and_then(Value::as_str).ok_or("Embedded webview URL is missing.")?;
    let url = Url::parse(raw_url).map_err(|_| "Embedded webview URL is invalid.")?;
    let allow_lti_external = info.get("lti").and_then(Value::as_bool).unwrap_or(false);
    let trusted_host = is_schoology_or_lausd_host(url.host_str().unwrap_or_default());
    let allowed_lti_url = allow_lti_external && url.scheme() == "https";
    if !matches!(url.scheme(), "http" | "https") || !(trusted_host || allowed_lti_url) {
        return Err("Only Schoology/LAUSD pages and HTTPS destinations inside an LTI assignment can be embedded.".into());
    }
    let parent = app.get_window("main").ok_or("The main Schoology window is unavailable.")?;
    let x = info.get("x").and_then(Value::as_f64).unwrap_or(0.0).max(0.0);
    let y = info.get("y").and_then(Value::as_f64).unwrap_or(0.0).max(0.0);
    let width = info.get("width").and_then(Value::as_f64).unwrap_or(1.0).max(1.0);
    let height = info.get("height").and_then(Value::as_f64).unwrap_or(1.0).max(1.0);
    let user_agent = info.get("userAgent").and_then(Value::as_str).unwrap_or(ANDROID_UA).to_owned();
    let initialization_script = info.get("initializationScript").and_then(Value::as_str).unwrap_or("").to_owned();
    #[cfg(target_os = "windows")]
    let force_dark_webview = info.get("forceDark").and_then(Value::as_bool).unwrap_or(false);
    let downloads_dir = app.path().download_dir().ok().filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(app.path().app_cache_dir().map_err(|e| e.to_string())?.join("downloads"));
    fs::create_dir_all(&downloads_dir).map_err(|e| format!("Could not prepare the downloads folder: {e}"))?;

    let popup_app = app.clone();
    let popup_label = label.clone();
    let popup_allow_lti_external = allow_lti_external;
    let download_app = app.clone();
    let view_label_for_download = label.clone();
    // Start on about:blank so the JS compatibility adapter can subscribe to native
    // navigation/load events before the first Schoology request begins. This avoids
    // losing the initial did-finish-load event on fast pages.
    let initial_url = url;
    let builder = WebviewBuilder::new(label.clone(), WebviewUrl::External(initial_url))
        .user_agent(&user_agent)
        .initialization_script(initialization_script)
        .disable_drag_drop_handler()
        .on_navigation(|next| {
            // Let the renderer's cancelable will-navigate compatibility event apply
            // its Schoology-link routing preference. The JS adapter opens unhandled
            // external HTTP(S) destinations through the system browser.
            next.as_str() == "about:blank" || next.scheme() == "schoology-download" || matches!(next.scheme(), "http" | "https")
        })
        .on_new_window(move |next, _features| {
            if matches!(next.scheme(), "http" | "https") && (is_schoology_or_lausd_host(next.host_str().unwrap_or_default()) || (popup_allow_lti_external && next.scheme() == "https")) {
                if let Some(view) = popup_app.get_webview(&popup_label) { let _ = view.navigate(next); }
            } else if matches!(next.scheme(), "http" | "https") {
                let _ = popup_app.opener().open_url(next.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .on_permission_request(|webview, kind| {
            let trusted = webview.url().ok().map(|current| current.scheme() == "https" && is_schoology_or_lausd_host(current.host_str().unwrap_or_default())).unwrap_or(false);
            if trusted && matches!(kind, PermissionKind::Camera | PermissionKind::Microphone) {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Deny
            }
        })
        .on_download(move |_webview, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    if url.scheme() != "https" || !is_schoology_or_lausd_host(url.host_str().unwrap_or_default()) { return false; }
                    let suggested = url.path_segments().and_then(|segments| segments.filter(|s| !s.is_empty()).next_back())
                        .filter(|name| !name.is_empty()).unwrap_or("Schoology-download");
                    let filename = safe_filename(suggested);
                    let mut target = downloads_dir.join(format!("{}-{}", epoch(), filename));
                    let mut suffix = 1u32;
                    while target.exists() {
                        target = downloads_dir.join(format!("{}-{}-{}", epoch(), suffix, filename));
                        suffix += 1;
                    }
                    *destination = target.clone();
                    let _ = download_app.emit("embedded-download-started", json!({"label":view_label_for_download,"url":url.as_str(),"path":target.to_string_lossy()}));
                    true
                }
                DownloadEvent::Finished { url, path, success } => {
                    let _ = download_app.emit("embedded-download-finished", json!({"label":view_label_for_download,"url":url.as_str(),"path":path.as_ref().map(|p|p.to_string_lossy().to_string()),"success":success}));
                    true
                }
                _ => true,
            }
        });
    #[cfg(target_os = "windows")]
    let builder = builder.additional_browser_args(if force_dark_webview { "--enable-features=OverlayScrollbar:mode/overlay,WebContentsForceDark" } else { "--enable-features=OverlayScrollbar:mode/overlay" });
    parent.add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(width, height))
        .map_err(|e| format!("Could not create the embedded Schoology webview: {e}"))?;
    Ok(json!({"label":label,"created":true}))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
async fn create_embedded_webview(_app: &AppHandle, _info: &Value) -> Result<Value, String> {
    Err("Inline remote webviews are not supported by the mobile build yet.".into())
}

fn is_schoology_or_lausd_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == "schoology.com" || host.ends_with(".schoology.com")
        || host == "schoologyca.com" || host.ends_with(".schoologyca.com")
        || host == "lms.lausd.net" || host.ends_with(".lms.lausd.net")
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn is_external_login_candidate(url: &Url, expected_domain: &str) -> bool {
    if url.scheme() != "https" { return false; }
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if url.query().unwrap_or_default().contains("sgyInitialPage") { return true; }
    if is_schoology_or_lausd_host(&host) { return true; }
    let expected = expected_domain.trim().trim_start_matches("https://").trim_start_matches("http://")
        .split('/').next().unwrap_or_default().split(':').next().unwrap_or_default().to_ascii_lowercase();
    !expected.is_empty() && (host == expected || host.ends_with(&format!(".{expected}")))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
async fn login_external_school(_app: &AppHandle, _state: &HostState, _info: &Value) -> Result<Value, String> {
    Err("External district login windows are not supported by the mobile build yet.".into())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
async fn login_external_school(app: &AppHandle, state: &HostState, info: &Value) -> Result<Value, String> {
    let label = info.get("label").and_then(Value::as_str).ok_or("The district sign-in window is unavailable.")?;
    if !label.starts_with("schoology-sso-") { return Err("The district sign-in window is not trusted.".into()); }
    let raw_url = info.get("url").and_then(Value::as_str).ok_or("The school sign-in URL is missing.")?;
    let url = Url::parse(raw_url).map_err(|_| "The school sign-in URL is invalid.")?;
    if !is_external_login_candidate(&url, info.get("domain").and_then(Value::as_str).unwrap_or_default()) {
        return Ok(json!({"ready":false}));
    }
    // This uses Tauri/Wry's native cookie store (WebView2 on Windows,
    // WKHTTPCookieStore on macOS, and WebKitGTK on Linux). Unlike document.cookie,
    // cookies_for_url includes HttpOnly and Secure cookies. Keep this command async:
    // WebView2 can deadlock when its cookie API is called from a synchronous command.
    let webview = app.get_webview_window(label).ok_or("The district sign-in window has closed.")?;
    let cookies = webview.cookies_for_url(url.clone()).map_err(|e| format!("Could not read the district sign-in cookie store: {e}"))?;
    let session_cookie = cookies.iter().find(|cookie| cookie.name().to_ascii_uppercase().starts_with("SESS"))
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()));
    let Some(session_cookie) = session_cookie else { return Ok(json!({"ready":false})); };

    sync_server_time(state).await;
    let temporary = request_token(state).await?;
    let token = temporary.get("oauth_token").and_then(Value::as_str).ok_or("Schoology returned an invalid request token.")?;
    let authorize_url = Url::parse(&format!("{}://{}/oauth/authorize_auto", url.scheme(), url.host_str().unwrap_or_default()))
        .map_err(|_| "The district sign-in host is invalid.")?;
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(6))
        .timeout(std::time::Duration::from_secs(30)).build().map_err(|e| e.to_string())?;
    let response = client.post(authorize_url)
        .header("User-Agent", ANDROID_UA).header("Accept", "application/json")
        .header("X-Schoology-Client", "Android").header("X-Schoology-App-Version", "2026.06.0")
        .header("Cookie", session_cookie).header("Content-Type", "application/x-www-form-urlencoded")
        .body(form_value(&json!({"oauth_token":token}))).send().await
        .map_err(|e| format!("School session authorization failed: {e}"))?;
    response_value(response).await.map_err(|e| format!("School session authorization failed: {e}"))?;
    let auth = exchange_token(app, state, &temporary).await?;
    Ok(json!({"ready":true,"auth":auth}))
}

async fn download_schoology_file(app: &AppHandle, state: &HostState, info: &Value) -> Result<Value, String> {
    let auth = auth_state(app).ok_or("Not signed in")?;
    let raw = info.get("url").and_then(Value::as_str).ok_or("File URL is missing.")?;
    let mut url = Url::parse(raw).or_else(|_| Url::parse(&format!("https://{}/{}", api_host(), raw.trim_start_matches('/')))).map_err(|_| "Schoology returned an invalid file URL.")?;
    if !["https", "http"].contains(&url.scheme()) { return Err("Unsupported file URL.".into()); }
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(6)).timeout(std::time::Duration::from_secs(120)).build().map_err(|e| e.to_string())?;
    let mut builder = client.get(url.clone()).header("User-Agent", ANDROID_UA).header("Accept", "*/*");
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if let Some(label) = info.get("webviewLabel").and_then(Value::as_str) {
        if !label.starts_with("schoology-embedded-") { return Err("The download source webview is not trusted.".into()); }
        if url.scheme() != "https" || !is_schoology_or_lausd_host(&host) {
            return Err("Only HTTPS downloads from Schoology or LAUSD pages can use the embedded session.".into());
        }
        let view = app.get_webview(label).ok_or("The embedded download source is no longer available.")?;
        let cookies = view.cookies_for_url(url.clone()).map_err(|e| format!("Could not read the embedded webview cookie store: {e}"))?;
        let cookie_header = cookies.iter().map(|cookie| format!("{}={}", cookie.name(), cookie.value())).collect::<Vec<_>>().join("; ");
        if !cookie_header.is_empty() { builder = builder.header("Cookie", cookie_header); }
    } else if host == web_host() || host.ends_with(".schoology.com") || host == "app.schoologyca.com" || host.ends_with(".schoologyca.com") || host == "app.schoologyca.com" || host.ends_with(".schoologyca.com") { builder = builder.header("Cookie", MOBILE_COOKIE); }
    if host == api_host() { builder = builder.header("Authorization", signed_header("GET", &url, auth["oauth_token"].as_str().unwrap_or(""), auth["oauth_token_secret"].as_str().unwrap_or(""), epoch() + *state.server_time_offset.lock().map_err(|e| e.to_string())?, &[])?); }
    let response = builder.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Schoology file download failed (HTTP {})", response.status().as_u16())); }
    let response_filename = response.headers().get(reqwest::header::CONTENT_DISPOSITION).and_then(|value| value.to_str().ok())
        .and_then(|header| header.split(';').map(str::trim).find_map(|part| part.strip_prefix("filename=").or_else(|| part.strip_prefix("filename*=UTF-8''"))))
        .map(|value| value.trim_matches('"').to_owned()).filter(|value| !value.is_empty());
    let response_mime = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or("application/octet-stream").to_owned());
    url = response.url().clone();
    let suggested = info.get("filename").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_owned)
        .or(response_filename).unwrap_or_else(|| url.path_segments().and_then(|s| s.last()).unwrap_or("Schoology-file").to_owned());
    let filename = safe_filename(&suggested);
    let mut dir = app.path().app_cache_dir().map_err(|e| e.to_string())?; dir.push("Schoology"); fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let unique = format!("{}-{}", epoch(), filename); let target = dir.join(unique);
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.starts_with(b"<!doctype html") || bytes.starts_with(b"<html") { return Err("Schoology returned an HTML page instead of the requested file.".into()); }
    tokio::fs::write(&target, &bytes).await.map_err(|e| e.to_string())?;
    let progress_id = info.get("progressId").and_then(Value::as_str).unwrap_or("");
    let _ = app.emit("file-download-progress", json!({"id":progress_id,"received":bytes.len(),"total":bytes.len(),"done":true}));
    Ok(json!({"path":target.to_string_lossy(),"filename":filename,"mime":info.get("mime").and_then(Value::as_str).or(response_mime.as_deref()).unwrap_or("application/octet-stream")}))
}
async fn upload_schoology_file(app: &AppHandle, state: &HostState, info: &Value, submit: bool) -> Result<Value, String> {
    let auth = auth_state(app).ok_or("Not signed in")?;
    let path = info.get("filePath").and_then(Value::as_str).ok_or("File information is incomplete.")?;
    let file_path = PathBuf::from(path);
    let filename = safe_filename(file_path.file_name().and_then(|s| s.to_str()).unwrap_or("attachment"));
    let data = tokio::fs::read(&file_path).await.map_err(|e| format!("Unable to read the selected file: {e}"))?;
    if data.is_empty() { return Err("The selected file is empty.".into()); }
    let mime = mime_for_path(&file_path, info.get("mime").and_then(Value::as_str));
    let timestamp = epoch() + *state.server_time_offset.lock().map_err(|e| e.to_string())?;
    let authorization = plaintext_header(auth["oauth_token"].as_str().unwrap_or(""), auth["oauth_token_secret"].as_str().unwrap_or(""), timestamp);
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|e| e.to_string())?;

    // First use the same FileService endpoint as the Electron implementation.
    // If it rejects the multipart request or returns no file id, fall back to
    // Schoology's legacy metadata + raw PUT upload sequence.
    let mut primary_error = String::new();
    let mut file_id: Option<Value> = None;
    let mut url = Url::parse(&format!("https://{}/v1/file", api_host())).map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("name", &filename);
    let part = reqwest::multipart::Part::bytes(data.clone()).file_name(filename.clone()).mime_str(&mime).map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let _ = app.emit("file-upload-progress", json!({"percent":0,"phase":"Uploading attachment…"}));
    match client.post(url).header("User-Agent", ANDROID_UA).header("Accept", "application/json")
        .header("X-Schoology-Client", "Android").header("X-Schoology-App-Version", "2026.06.0")
        .header("Authorization", authorization).header("Cookie", MOBILE_COOKIE).multipart(form).send().await {
        Ok(response) => {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            if status.is_success() {
                if let Ok(result) = serde_json::from_str::<Value>(&text) {
                    file_id = result.get("fileMetadataId").or(result.get("id")).or(result.get("file_id")).cloned();
                }
                if file_id.is_none() { primary_error = "FileService response did not contain a file id.".into(); }
            } else {
                primary_error = format!("FileService HTTP {}: {}", status.as_u16(), text.chars().take(400).collect::<String>());
            }
        }
        Err(error) => primary_error = error.to_string(),
    }

    if file_id.is_none() {
        let _ = app.emit("file-upload-progress", json!({"percent":2,"phase":"Preparing upload fallback…"}));
        let checksum = format!("{:x}", Md5::digest(&data));
        let metadata_url = Url::parse(&format!("https://{}/v1/upload", api_host())).map_err(|e| e.to_string())?;
        let metadata = api_json(app, state, "POST", metadata_url, Some(json!({
            "filename": filename,
            "md5_checksum": checksum,
            "filesize": data.len()
        })), true).await.map_err(|e| format!("FileService upload failed ({primary_error}); legacy metadata upload failed: {e}"))?;
        let upload_id = metadata.get("id").or_else(|| metadata.get("upload_file_id")).or_else(|| metadata.get("uploadFileID"))
            .cloned().ok_or_else(|| format!("FileService upload failed ({primary_error}); legacy metadata response did not contain an upload id."))?;
        let put_url = Url::parse(&format!("https://{}/v1/upload/{}", api_host(), url::form_urlencoded::byte_serialize(upload_id.to_string().trim_matches('"').as_bytes()).collect::<String>())).map_err(|e| e.to_string())?;
        let timestamp = epoch() + *state.server_time_offset.lock().map_err(|e| e.to_string())?;
        let header = signed_header("PUT", &put_url, auth["oauth_token"].as_str().unwrap_or(""), auth["oauth_token_secret"].as_str().unwrap_or(""), timestamp, &[])?;
        let _ = app.emit("file-upload-progress", json!({"percent":5,"phase":"Uploading file…"}));
        let response = client.put(put_url).header("User-Agent", ANDROID_UA).header("Accept", "application/json")
            .header("Content-Type", &mime).header("Content-Length", data.len().to_string())
            .header("Authorization", header).header("Cookie", MOBILE_COOKIE).body(data.clone()).send().await
            .map_err(|e| format!("FileService upload failed ({primary_error}); legacy file upload failed: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("FileService upload failed ({primary_error}); legacy file upload failed (HTTP {}).", response.status().as_u16()));
        }
        file_id = Some(upload_id);
    }

    let file_id = file_id.ok_or("Schoology did not return an uploaded file ID.")?;
    let _ = app.emit("file-upload-progress", json!({"percent":90,"phase":if submit { "Submitting assignment…" } else { "Finishing attachment…" }}));
    if submit {
        let section = info.get("sectionId").and_then(Value::as_i64).ok_or("Submission information is incomplete.")?;
        let assignment = info.get("assignmentId").and_then(Value::as_i64).ok_or("Submission information is incomplete.")?;
        let url = Url::parse(&format!("https://{}/v1/section/{section}/assignment/{assignment}/submission", api_host())).map_err(|e| e.to_string())?;
        api_json(app, state, "POST", url, Some(json!({"files":[{"id":file_id}]})), true).await?;
        let _ = app.emit("file-upload-progress", json!({"percent":100,"phase":"Upload complete"}));
        Ok(json!(true))
    } else {
        let _ = app.emit("file-upload-progress", json!({"percent":100,"phase":"Attachment uploaded"}));
        Ok(json!(file_id.as_str().map(str::to_owned).unwrap_or_else(|| file_id.to_string()).trim_matches('"')))
    }
}

fn notification_key(item: &Value) -> String {
    item.get("id").or_else(|| item.get("notification_id")).or_else(|| item.get("notificationId"))
        .map(|v| if v.is_string() { v.as_str().unwrap_or_default().to_owned() } else { v.to_string() })
        .unwrap_or_else(|| format!("{}:{}:{}", item.get("type").and_then(Value::as_str).unwrap_or(""),
            item.get("created").or_else(|| item.get("timestamp")).map(Value::to_string).unwrap_or_default(),
            item.get("body").or_else(|| item.get("message")).or_else(|| item.get("title")).and_then(Value::as_str).unwrap_or("")))
}

fn notification_body(item: &Value) -> String {
    let mut body = item.get("body").or_else(|| item.get("message")).or_else(|| item.get("title"))
        .and_then(Value::as_str).unwrap_or("You have a new Schoology notification").to_owned();
    if let Some(args) = item.get("body_args").or_else(|| item.get("bodyArgs")).and_then(Value::as_array) {
        for arg in args {
            let replacement = arg.get("title").or_else(|| arg.get("name")).and_then(Value::as_str).unwrap_or("");
            if let Some(index) = body.find("%s") { body.replace_range(index..index + 2, replacement); }
        }
    }
    let mut clean = String::with_capacity(body.len());
    let mut in_tag = false;
    for ch in body.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => clean.push(ch),
            _ => {},
        }
    }
    clean.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(220).collect()
}

async fn poll_notifications(app: &AppHandle, state: &HostState) {
    let Some(auth) = auth_state(app) else { return; };
    let response = match api_json(app, state, "GET", Url::parse(&format!("https://{}/v1/notifications", api_host())).unwrap(), None, false).await {
        Ok(value) => value,
        Err(error) => { if !error.contains("Not signed in") && !error.contains("401") { eprintln!("Schoology notification poll failed: {error}"); } return; }
    };
    let raw = response.get("notification").or_else(|| response.get("notifications"))
        .or_else(|| response.get("data").and_then(|v| v.get("notification")))
        .or_else(|| response.get("data").and_then(|v| v.get("notifications"))).cloned().unwrap_or(json!([]));
    let items: Vec<Value> = if let Some(list) = raw.as_array() { list.clone() }
        else { raw.get("notification").or_else(|| raw.get("notifications")).or_else(|| raw.get("items"))
            .and_then(Value::as_array).cloned().unwrap_or_default() };
    let user_id = auth.get("userId").or_else(|| auth.get("user").and_then(|u| u.get("id")))
        .map(|v| if v.is_string() { v.as_str().unwrap_or_default().to_owned() } else { v.to_string() }).unwrap_or_default();
    let keys: Vec<String> = items.iter().map(notification_key).collect();
    let previous = read_json(app, "notification-seen.json", json!({}));
    let same_user = previous.get("userId").and_then(Value::as_str).unwrap_or("") == user_id;
    let seen: std::collections::HashSet<String> = if same_user {
        previous.get("ids").and_then(Value::as_array).cloned().unwrap_or_default().iter()
            .filter_map(|v| v.as_str().map(str::to_owned)).collect()
    } else { std::collections::HashSet::new() };
    let settings = read_json(app, "app-settings.json", json!({}));
    if same_user && settings.get("desktopNotifications").and_then(Value::as_bool).unwrap_or(true) {
        let mut new_items: Vec<&Value> = items.iter().filter(|item| !seen.contains(&notification_key(item))).take(3).collect();
        new_items.reverse();
        for item in &new_items {
            let body = notification_body(item);
            let title = item.get("title").or_else(|| item.get("type_label")).and_then(Value::as_str).unwrap_or("Schoology");
            let _ = app.notification().builder().title(title).body(if body.is_empty() { "You have a new Schoology notification" } else { &body }).show();
        }
        if !new_items.is_empty() && notification_sound_enabled(app) { play_system_notification_sound(); }
    }
    let ids: Vec<Value> = keys.into_iter().take(200).map(Value::String).collect();
    let _ = write_json(app, "notification-seen.json", &json!({"userId":user_id,"ids":ids}));
}

async fn update_assignment_grade(app: &AppHandle, state: &HostState, info: &Value) -> Result<Value, String> {
    let section_id = info.get("sectionId").and_then(Value::as_i64).filter(|id| *id > 0)
        .ok_or("Grade update information is incomplete: section ID is missing.")?;
    let assignment_id = info.get("assignmentId").and_then(Value::as_i64).filter(|id| *id > 0)
        .ok_or("Grade update information is incomplete: assignment ID is missing.")?;
    let enrollment_id = info.get("enrollmentId").and_then(Value::as_i64).filter(|id| *id > 0)
        .ok_or("Grade update information is incomplete: enrollment ID is missing.")?;
    let grade = info.get("grade").cloned().unwrap_or(Value::String(String::new()));
    if let Some(value) = grade.as_str() {
        if !value.trim().is_empty() && value.trim().parse::<f64>().is_err() {
            return Err("Grade must be a number or empty to clear the grade.".into());
        }
    } else if !grade.is_number() {
        return Err("Grade must be a number or empty to clear the grade.".into());
    }
    let comment = info.get("comment").and_then(Value::as_str).unwrap_or("");
    let comment_status = if info.get("commentStatus").and_then(Value::as_bool).unwrap_or(false) { 1 } else { 0 };
    let url = Url::parse(&format!("https://{}/v1/sections/{section_id}/grades/{assignment_id}", api_host()))
        .map_err(|e| e.to_string())?;
    let payload = json!({
        "enrollment_id": enrollment_id,
        "grade": if grade.is_string() { grade.as_str().unwrap_or("").trim().to_owned() } else { grade.to_string() },
        "comment": comment,
        "comment_status": comment_status
    });
    api_json(app, state, "PUT", url, Some(payload), false).await?;
    Ok(json!(true))
}

async fn prepare_web_session(app: &AppHandle, state: &HostState) -> Result<Value, String> {
    let _auth = auth_state(app).ok_or("Not signed in")?;
    let mut url = Url::parse(&format!("https://{}/v1/sessionstart", api_host())).map_err(|e| e.to_string())?;
    url.query_pairs_mut().append_pair("for_domain", web_host());
    let response = api_json(app, state, "GET", url, None, false).await?;
    let cookies = response.get("cookie").or_else(|| response.get("cookies")).and_then(Value::as_array).cloned().unwrap_or_default();
    if cookies.is_empty() { return Err("Schoology did not return web-session cookies.".into()); }
    // Electron installs the sessionstart cookies without an HttpOnly flag.
    // Tauri has no cross-platform cookie setter, so the trusted adapter installs
    // the same ordinary cookies through an initialization script restricted to
    // Schoology hosts. Never pass cookies for arbitrary domains to the renderer.
    let safe_cookies: Vec<Value> = cookies.into_iter().filter(|cookie| {
        let name = cookie.get("key").or_else(|| cookie.get("name")).and_then(Value::as_str).unwrap_or("");
        let value = cookie.get("value").and_then(Value::as_str).unwrap_or("");
        let domain = cookie.get("domain").and_then(Value::as_str).unwrap_or(if web_host() == "app.schoologyca.com" { ".schoologyca.com" } else { ".schoology.com" }).trim_start_matches('.').to_ascii_lowercase();
        !name.is_empty() && !value.is_empty()
            && !name.chars().any(|c| c.is_control() || c == ';' || c == '=')
            && !value.chars().any(|c| c.is_control() || c == ';' || c == ',')
            && (domain == "schoology.com" || domain.ends_with(".schoology.com") || domain == "schoologyca.com" || domain.ends_with(".schoologyca.com"))
    }).collect();
    if safe_cookies.is_empty() { return Err("Schoology returned no usable web-session cookies.".into()); }
    Ok(json!({ "cookies": safe_cookies, "mobileCookie": MOBILE_COOKIE.split_once('=').map(|(_, value)| value).unwrap_or("") }))
}

fn schoology_api_url(path: &str) -> Result<Url, String> {
    let normalized = path.trim().trim_start_matches('/');
    if normalized.starts_with("http://") || normalized.starts_with("https://") {
        let url = Url::parse(normalized).map_err(|_| "Invalid Schoology API URL.".to_string())?;
        if url.scheme() != "https" || url.host_str() != Some(api_host()) {
            return Err("Schoology API requests must target the active Schoology API host over HTTPS.".into());
        }
        return Ok(url);
    }
    if normalized.split('/').any(|part| part == "..") {
        return Err("Invalid Schoology API path.".into());
    }
    let versioned_path = if normalized == "v2" || normalized.starts_with("v2/") {
        normalized.to_owned()
    } else if normalized == "v1" || normalized.starts_with("v1/") {
        normalized.to_owned()
    } else {
        format!("v1/{normalized}")
    };
    Url::parse(&format!("https://{}/{versioned_path}", api_host())).map_err(|e| e.to_string())
}

fn safe_filename(value: &str) -> String {
    let cleaned: String = value.chars().map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { '_' } else { c }).collect();
    let cleaned = cleaned.trim().trim_matches('.');
    let cleaned = if cleaned.is_empty() { "Schoology-file" } else { cleaned };
    cleaned.chars().take(180).collect()
}

fn mime_for_path(path: &Path, explicit: Option<&str>) -> String {
    if let Some(mime) = explicit.filter(|s| s.contains('/') && !s.contains('\n') && !s.contains('\r')) {
        return mime.to_owned();
    }
    match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "pdf" => "application/pdf", "txt" => "text/plain", "csv" => "text/csv",
        "jpg" | "jpeg" => "image/jpeg", "png" => "image/png", "gif" => "image/gif", "webp" => "image/webp", "svg" => "image/svg+xml",
        "doc" => "application/msword", "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel", "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint", "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "zip" => "application/zip", "mp3" => "audio/mpeg", "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }.to_owned()
}

fn local_release_number() -> u64 {
    APP_VERSION.rsplit('.').next().and_then(|s| s.parse().ok()).unwrap_or(0)
}

fn update_asset_suffixes() -> Vec<&'static str> {
    match std::env::consts::OS {
        "windows" => vec!["_x64-setup.exe", "-x64-setup.exe", "Setup-x64.exe"],
        "macos" => vec![".app.zip"],
        "linux" => vec!["amd64.deb", "x86_64.rpm"],
        _ => vec![],
    }
}

async fn fetch_release(repo: &str) -> Result<Value, String> {
    let url = Url::parse(&format!("https://api.github.com/repos/{repo}/releases/latest")).map_err(|e| e.to_string())?;
    let response = reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().map_err(|e| e.to_string())?
        .get(url).header("User-Agent", "Schoology-Desktop-Port-Updater").header("Accept", "application/vnd.github+json").send().await.map_err(|e| format!("Could not check releases: {e}"))?;
    response_value(response).await
}

fn select_update_asset(release: &Value) -> Result<Value, String> {
    if release.get("draft").and_then(Value::as_bool).unwrap_or(false) || release.get("prerelease").and_then(Value::as_bool).unwrap_or(false) {
        return Err("No stable release is currently available.".into());
    }
    let assets = release.get("assets").and_then(Value::as_array).ok_or("The release has no downloadable assets.")?;
    for suffix in update_asset_suffixes() {
        if let Some(asset) = assets.iter().find(|asset| asset.get("name").and_then(Value::as_str).unwrap_or("").ends_with(suffix)) {
            return Ok(asset.clone());
        }
    }
    Err(format!("No compatible installer was found for {} ({}).", std::env::consts::OS, std::env::consts::ARCH))
}

fn release_asset_info(release: &Value, asset: &Value, repo: &str, product_name: &str) -> Value {
    json!({
        "checked": true,
        "tag": release.get("tag_name").and_then(Value::as_str).unwrap_or(""),
        "version": release.get("tag_name").and_then(Value::as_str).unwrap_or("").trim_start_matches('v'),
        "assetName": asset.get("name").and_then(Value::as_str).unwrap_or(""),
        "url": asset.get("browser_download_url").and_then(Value::as_str).unwrap_or(""),
        "size": asset.get("size").and_then(Value::as_u64).unwrap_or(0),
        "digest": asset.get("digest").cloned().unwrap_or(Value::Null),
        "repository": repo,
        "productName": product_name,
        "useWindowsUpdater": cfg!(target_os = "windows") && product_name == "Schoology"
    })
}

async fn check_for_updates() -> Result<Value, String> {
    let release = fetch_release("tling0001/schoology-for-desktop-port").await?;
    let tag = release.get("tag_name").and_then(Value::as_str).unwrap_or("");
    let remote = tag.rsplit('.').next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let local = local_release_number();
    if remote == 0 || remote <= local || release.get("draft").and_then(Value::as_bool).unwrap_or(false) || release.get("prerelease").and_then(Value::as_bool).unwrap_or(false) {
        return Ok(json!({"checked":true,"available":false,"version":local}));
    }
    let asset = select_update_asset(&release)?;
    let mut info = release_asset_info(&release, &asset, "tling0001/schoology-for-desktop-port", "Schoology");
    info["available"] = json!(true);
    Ok(info)
}

async fn download_update(app: &AppHandle, info: &Value) -> Result<PathBuf, String> {
    let raw_url = info.get("url").and_then(Value::as_str).ok_or("The update download URL is missing.")?;
    let url = Url::parse(raw_url).map_err(|_| "The update URL is invalid.")?;
    if url.scheme() != "https" || !matches!(url.host_str(), Some("github.com") | Some("objects.githubusercontent.com") | Some("release-assets.githubusercontent.com")) {
        return Err("Updates must be downloaded from GitHub over HTTPS.".into());
    }
    let name = safe_filename(info.get("assetName").and_then(Value::as_str).unwrap_or("schoology-update"));
    let mut dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    dir.push("Schoology"); dir.push("updates");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(name);
    let temporary = target.with_extension("download-part");
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(8)).timeout(std::time::Duration::from_secs(600)).build().map_err(|e| e.to_string())?;
    let response = client.get(url).header("User-Agent", "Schoology-Desktop-Port-Updater").send().await.map_err(|e| format!("Update download failed: {e}"))?;
    if !response.status().is_success() { return Err(format!("Update download failed (HTTP {}).", response.status().as_u16())); }
    let total = response.content_length().or_else(|| info.get("size").and_then(Value::as_u64)).unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
    let mut received: u64 = 0;
    let mut hasher = Sha256::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Update download interrupted: {e}"))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        let percent = if total > 0 { Some(((received.saturating_mul(100) / total).min(100)) as u8) } else { None };
        let _ = app.emit("update-download-progress", json!({"received":received,"total":total,"percent":percent,"done":false}));
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    if total > 0 && received != total { let _ = fs::remove_file(&temporary); return Err(format!("Update download was incomplete ({received}/{total} bytes).")); }
    if let Some(digest) = info.get("digest").and_then(Value::as_str).and_then(|s| s.strip_prefix("sha256:")) {
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(digest) { let _ = fs::remove_file(&temporary); return Err("The downloaded update failed its SHA-256 integrity check.".into()); }
    }
    if target.exists() { fs::remove_file(&target).map_err(|e| e.to_string())?; }
    fs::rename(&temporary, &target).map_err(|e| e.to_string())?;
    let _ = app.emit("update-download-progress", json!({"received":received,"total":total.max(received),"percent":100,"done":true}));
    Ok(target)
}

fn schedule_app_exit(app: AppHandle, delay_ms: u64) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        app.exit(0);
    });
}

#[cfg(target_os = "macos")]
fn launch_macos_replacement(app: &AppHandle, installer: &Path) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let target_app = executable.parent().and_then(Path::parent).and_then(Path::parent)
        .ok_or("Could not determine the installed Schoology.app location.")?.to_path_buf();
    let temp = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("Schoology").join("updates");
    fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
    let script_path = temp.join(format!("replace-schoology-{}.sh", std::process::id()));
    let mount_path = temp.join(format!("mount-{}-{}", std::process::id(), epoch()));
    let staged_path = target_app.with_file_name(format!(".Schoology-update-{}-{}.app", std::process::id(), epoch()));
    let backup_path = target_app.with_file_name(format!(".Schoology-backup-{}-{}.app", std::process::id(), epoch()));
    let log_path = temp.join("update-install.log");
    let q = |value: &str| format!("'{}'", value.replace('\'', "'\"'\"'"));
    let script = format!(r#"#!/bin/bash
set -euo pipefail
exec >>{log} 2>&1
INSTALLER={installer}
TARGET={target}
STAGED={staged}
MOUNT={mount}
PID={pid}
MOUNTED=0
cleanup() {{
  if [ "$MOUNTED" -eq 1 ]; then hdiutil detach "$MOUNT" -force >/dev/null 2>&1 || true; fi
  rm -rf "$MOUNT"
  rm -f "$INSTALLER" "$0"
}}
trap cleanup EXIT
mkdir -p "$MOUNT"
for i in {{1..300}}; do kill -0 "$PID" 2>/dev/null || break; sleep .2; done
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$INSTALLER"
MOUNTED=1
APP=$(find "$MOUNT" -maxdepth 5 -name '*.app' -type d -print -quit)
if [ -z "$APP" ]; then echo 'No .app bundle found in the downloaded DMG'; exit 1; fi
rm -rf "$STAGED"
ditto --rsrc --extattr "$APP" "$STAGED"
hdiutil detach "$MOUNT" -force
MOUNTED=0
BACKUP={backup}
if [ -e "$TARGET" ]; then mv "$TARGET" "$BACKUP"; fi
if mv "$STAGED" "$TARGET"; then rm -rf "$BACKUP"; else [ ! -e "$BACKUP" ] || mv "$BACKUP" "$TARGET"; exit 1; fi
open "$TARGET"
"#,
        log=q(log_path.to_string_lossy().as_ref()),
        installer=q(installer.to_string_lossy().as_ref()),
        target=q(target_app.to_string_lossy().as_ref()),
        staged=q(staged_path.to_string_lossy().as_ref()),
        backup=q(backup_path.to_string_lossy().as_ref()),
        mount=q(mount_path.to_string_lossy().as_ref()),
        pid=std::process::id());
    fs::write(&script_path, script).map_err(|e| e.to_string())?;
    #[cfg(unix)] {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&script_path).map_err(|e| e.to_string())?.permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&script_path, permissions).map_err(|e| e.to_string())?;
    }
    Command::new("/bin/bash").arg(&script_path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|e| format!("Could not start the macOS update helper: {e}"))?;
    Ok(())
}

async fn install_update(app: &AppHandle, info: &Value) -> Result<Value, String> {
    #[cfg(target_os = "windows")]
    {
        if info.get("useWindowsUpdater").and_then(Value::as_bool).unwrap_or(false) {
            let updater = app.path().resource_dir().map_err(|e| e.to_string())?.join("SchoologyUpdater.exe");
            if !updater.is_file() {
                return Err("The Schoology Windows updater is missing from this installation. Reinstall the current version and try again.".into());
            }
            let current = std::env::current_exe().map_err(|e| e.to_string())?;
            let install_dir = current.parent().ok_or("Could not determine the Schoology installation folder.")?;
            // Copy the helper out of resources before launching it. Windows cannot
            // replace a running executable in the installed resources directory.
            let mut updater_temp = app.path().app_cache_dir().map_err(|e| e.to_string())?;
            updater_temp.push("Schoology");
            updater_temp.push("updater");
            fs::create_dir_all(&updater_temp).map_err(|e| e.to_string())?;
            let staged_updater = updater_temp.join(format!("SchoologyUpdater-{}.exe", std::process::id()));
            fs::copy(&updater, &staged_updater).map_err(|e| format!("Could not stage the Schoology updater: {e}"))?;
            // Tauri's Windows WebView uses this loader DLL beside the executable.
            // Stage it beside the helper as well, because the helper runs from cache.
            let loader_candidates = [
                install_dir.join("WebView2Loader.dll"),
                app.path().resource_dir().map_err(|e| e.to_string())?.join("WebView2Loader.dll"),
            ];
            let staged_loader = updater_temp.join("WebView2Loader.dll");
            let mut loader_staged = false;
            for candidate in loader_candidates {
                if candidate.is_file() {
                    fs::copy(&candidate, &staged_loader).map_err(|e| format!("Could not stage WebView2Loader.dll: {e}"))?;
                    loader_staged = true;
                    break;
                }
            }
            if !loader_staged {
                let _ = fs::remove_file(&staged_updater);
                return Err("Could not find WebView2Loader.dll to launch the standalone Tauri updater.".into());
            }
            let theme = read_json(&app, "theme-settings.json", json!({"mode":"system"}));
            let theme_mode = theme.get("mode").and_then(Value::as_str).unwrap_or("system");
            let payload = json!({
                "url": info.get("url").and_then(Value::as_str).unwrap_or(""),
                "size": info.get("size").and_then(Value::as_u64).unwrap_or(0),
                "digest": info.get("digest").cloned().unwrap_or(Value::Null),
                "version": info.get("version").and_then(Value::as_str).unwrap_or(""),
                "productName": "Schoology",
                "installDir": install_dir.to_string_lossy(),
                "installMode": "current-user",
                "parentPid": std::process::id(),
                "stagedUpdaterPath": staged_updater.to_string_lossy(),
                "stagedUpdaterLoaderPath": if loader_staged { json!(staged_loader.to_string_lossy()) } else { Value::Null },
                "themeMode": theme_mode,
                "darkTheme": theme.get("forceDark").and_then(Value::as_bool).unwrap_or(false) || theme_mode == "dark"
            });
            let encoded = BASE64.encode(serde_json::to_vec(&payload).map_err(|e| e.to_string())?);
            if let Err(error) = Command::new(&staged_updater).arg(format!("--payload-base64={encoded}"))
                .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                .spawn() {
                let _ = fs::remove_file(&staged_updater);
                if loader_staged { let _ = fs::remove_file(&staged_loader); }
                return Err(format!("Could not launch the Schoology updater: {error}"));
            }
            let _ = app.emit("update-install-started", json!({"updater":true,"version":payload["version"]}));
            schedule_app_exit(app.clone(), 600);
            return Ok(json!(true));
        }
    }
    let path = if let Some(path) = info.as_str() { PathBuf::from(path) } else { download_update(app, info).await? };
    if !path.is_file() { return Err("The update installer could not be found.".into()); }
    let _ = app.emit("update-install-started", json!({"path":path.to_string_lossy()}));
    #[cfg(target_os = "windows")]
    {
        // Fallback for explicit local installer paths; normal releases use the progress updater.
        Command::new(&path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn().map_err(|e| format!("Could not launch the Schoology installer: {e}"))?;
        schedule_app_exit(app.clone(), 900);
        return Ok(json!(true));
    }
    #[cfg(target_os = "macos")]
    {
        launch_macos_replacement(app, &path)?;
        schedule_app_exit(app.clone(), 250);
        return Ok(json!(true));
    }
    #[cfg(target_os = "linux")]
    {
        // Linux package installation is delegated to the user's package manager.
        app.opener().open_path(path.to_string_lossy().as_ref(), None::<&str>)
            .map_err(|e| format!("Could not open the update package: {e}"))?;
        return Ok(json!(true));
    }
    #[allow(unreachable_code)]
    Err("Automatic installation is not supported on this platform.".into())
}

fn notification_sound_enabled(app: &AppHandle) -> bool {
    read_json(app, "app-settings.json", json!({})).get("notificationSound").and_then(Value::as_bool).unwrap_or(false)
}

fn play_system_notification_sound() {
    #[cfg(target_os = "windows")]
    unsafe {
        #[link(name = "user32")]
        extern "system" { fn MessageBeep(kind: u32) -> i32; }
        let _ = MessageBeep(0x00000040);
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("/usr/bin/afplay").arg("/System/Library/Sounds/Glass.aiff")
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let played = Command::new("canberra-gtk-play").args(["--id", "message"])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok();
        if !played {
            let _ = Command::new("paplay").arg("/usr/share/sounds/freedesktop/stereo/message.oga")
                .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
        }
    }
}

async fn latest_alternate_release(repo: &str, product_name: &str) -> Result<Value, String> {
    let release = fetch_release(repo).await?;
    let asset = select_update_asset(&release)?;
    Ok(release_asset_info(&release, &asset, repo, product_name))
}

#[tauri::command]
async fn schoology_invoke(app: AppHandle, state: State<'_, HostState>, name: String, args: Option<Value>) -> Result<Value, String> {
    if name != "set-server-instance" {
        let enabled = read_json(&app, "server-instance.json", json!({"canadian":false})).get("canadian").and_then(Value::as_bool).unwrap_or(false);
        CANADIAN_INSTANCE.store(enabled, Ordering::Relaxed);
    }
    let args = args.unwrap_or(Value::Null);
    match name.as_str() {
        "auth-state" => Ok(auth_state(&app).unwrap_or(Value::Null)),
        "renderer-deep-link-ready" => {
            if let Ok(mut ready) = state.renderer_ready.lock() { *ready = true; }
            let pending = state.pending_deep_link.lock().ok().and_then(|mut pending| pending.take());
            if let Some(url) = pending { let _ = app.emit("schoology-deep-link", url); }
            Ok(json!(true))
        },
        "app-version" => Ok(json!(APP_VERSION)),
        "get-open-schoology-links" => Ok(json!(read_json(&app,"app-settings.json",json!({"openSchoologyLinks":true})).get("openSchoologyLinks").and_then(Value::as_bool).unwrap_or(true))),
        "set-open-schoology-links" => { let mut v=read_json(&app,"app-settings.json",json!({})); if !v.is_object(){v=json!({});} v["openSchoologyLinks"]=args; write_json(&app,"app-settings.json",&v)?; Ok(v["openSchoologyLinks"].clone()) },
        "get-desktop-notifications" => Ok(json!(read_json(&app,"app-settings.json",json!({})).get("desktopNotifications").and_then(Value::as_bool).unwrap_or(true))),
        "set-desktop-notifications" => { let mut v=read_json(&app,"app-settings.json",json!({})); if !v.is_object(){v=json!({});} v["desktopNotifications"]=args; write_json(&app,"app-settings.json",&v)?; Ok(v["desktopNotifications"].clone()) },
        "get-notification-sound" => Ok(json!(read_json(&app,"app-settings.json",json!({})).get("notificationSound").and_then(Value::as_bool).unwrap_or(false))),
        "set-notification-sound" => { let mut v=read_json(&app,"app-settings.json",json!({})); if !v.is_object(){v=json!({});} v["notificationSound"]=args; write_json(&app,"app-settings.json",&v)?; Ok(v["notificationSound"].clone()) },
        "get-server-instance" => { let enabled=read_json(&app,"server-instance.json",json!({"canadian":false})).get("canadian").and_then(Value::as_bool).unwrap_or(false); CANADIAN_INSTANCE.store(enabled,Ordering::Relaxed); Ok(json!(enabled)) },
        "set-server-instance" => { let enabled=args.as_bool().unwrap_or(false); CANADIAN_INSTANCE.store(enabled,Ordering::Relaxed); write_json(&app,"server-instance.json",&json!({"canadian":enabled}))?; Ok(json!(enabled)) },
        "get-theme-mode" => Ok(json!(read_json(&app,"theme-settings.json",json!({"mode":"system"})).get("mode").and_then(Value::as_str).unwrap_or("system"))),
        "set-theme-mode" => { let mode=args.as_str().filter(|s| ["light","dark","system"].contains(s)).unwrap_or("system"); let mut v=read_json(&app,"theme-settings.json",json!({})); if !v.is_object(){v=json!({});} v["mode"]=json!(mode); write_json(&app,"theme-settings.json",&v)?; Ok(json!(mode)) },
        "get-experimental-force-dark" => Ok(json!(read_json(&app,"theme-settings.json",json!({})).get("forceDark").and_then(Value::as_bool).unwrap_or(false))),
        "set-experimental-force-dark" => { let mut v=read_json(&app,"theme-settings.json",json!({})); if !v.is_object(){v=json!({});} let enabled=args.as_bool().unwrap_or(false); v["forceDark"]=json!(enabled); write_json(&app,"theme-settings.json",&v)?; Ok(json!(enabled)) },
        "network-online" => {
            let client = reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(3))
                .timeout(std::time::Duration::from_secs(5)).build().map_err(|e| e.to_string())?;
            Ok(json!(client.get("https://app.schoology.com").send().await.is_ok()))
        },
        "login-credentials" => login_credentials(&app,&state,&args).await,
        "login-qr" => login_qr(&app,&state,args.as_str().unwrap_or("")).await,
        "login-school-browser" => login_school_browser(&app,&state,&args).await,
        "logout" => {
            let path = app_file(&app, "auth.json")?;
            if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
            let seen = app_file(&app, "notification-seen.json")?;
            let _ = fs::remove_file(seen);
            if let Ok(mut pending) = state.pending_login.lock() { pending.take(); }
            let _ = app.emit("schoology-clear-web-session", json!({}));
            Ok(json!(true))
        },
        "school-search" => {
            let query = args.as_str().unwrap_or("").trim();
            if query.is_empty() { return Ok(json!([])); }
            let url = Url::parse_with_params(&format!("https://{}/v1/login/school_search", api_host()), &[("query", query)]).map_err(|e| e.to_string())?;
            let response = request("GET", url, None, None, &state, true, None, false).await?;
            let value = response_value(response).await?;
            let schools = value.get("school").and_then(Value::as_array).ok_or_else(|| {
                format!("Schoology returned an unexpected school-search response: {}", value.to_string().chars().take(300).collect::<String>())
            })?;
            Ok(json!(schools))
        },
        "api" => api_call(&app,&state,&args).await,
        "fetch-image" => fetch_image(&app,&state,args.as_str().unwrap_or("")).await,
        "submit-assignment-text" => submit_assignment_text(&app,&state,&args).await,
        "submit-assignment-resource" => submit_assignment_resource(&app,&state,&args).await,
        "submit-assignment-file" => upload_schoology_file(&app,&state,&args,true).await,
        "upload-schoology-file" => upload_schoology_file(&app,&state,&args,false).await,
        "download-file" => download_schoology_file(&app,&state,&args).await,
        "launch-course-app" => launch_course_app(&app,&state,&args).await,
        "pick-file" => {
            let picked = app.dialog().file().blocking_pick_file();
            match picked { Some(file) => match file.into_path() { Ok(path) => Ok(json!(path.to_string_lossy())), Err(e) => Err(e.to_string()) }, None => Ok(Value::Null) }
        },
        "open-downloaded-file" => {
            let path = args.get("path").and_then(Value::as_str).ok_or("Missing downloaded file path")?;
            app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())?;
            Ok(json!(""))
        },
        "reveal-downloaded-file" => {
            let path = args.get("path").and_then(Value::as_str).ok_or("Missing downloaded file path")?;
            let parent = Path::new(path).parent().ok_or("Invalid downloaded file path")?;
            app.opener().open_path(parent.to_string_lossy().as_ref(), None::<&str>).map_err(|e| e.to_string())?;
            Ok(json!(""))
        },
        "open-external" => { let url=args.as_str().ok_or("Missing URL")?; if !(url.starts_with("https://")||url.starts_with("http://")) { return Err("Only HTTP(S) URLs may be opened externally.".into()); } app.opener().open_url(url,None::<&str>).map_err(|e|e.to_string())?; Ok(json!(true)) },
        "create-embedded-webview" => create_embedded_webview(&app, &args).await,
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        "close-embedded-webview" => {
            let label = args.get("label").and_then(Value::as_str).unwrap_or("");
            if label.starts_with("schoology-embedded-") {
                if let Some(view) = app.get_webview(label) {
                    let _ = view.set_position(LogicalPosition::new(-10000.0, -10000.0));
                    let _ = view.set_size(LogicalSize::new(1.0, 1.0));
                    view.close().map_err(|e| format!("Could not close embedded webview: {e}"))?;
                }
            }
            Ok(json!(true))
        },
        #[cfg(any(target_os = "android", target_os = "ios"))]
        "close-embedded-webview" => Ok(json!(true)),
        "prepare-web-session" => prepare_web_session(&app, &state).await,
        "login-external-school" => login_external_school(&app, &state, &args).await,
        "set-window-chrome" => Ok(json!(true)),
        "get-window-chrome-mode" => Ok(json!({"overlay":read_json(&app,"window-chrome.json",json!({})).get("overlay").and_then(Value::as_bool).unwrap_or(false),"platform":std::env::consts::OS})),
        "set-window-chrome-mode" => {
            let enabled = args.as_bool().unwrap_or(false);
            write_json(&app,"window-chrome.json",&json!({"overlay":enabled}))?;
            let current = std::env::current_exe().map_err(|e| e.to_string())?;
            // Wait for the single-instance process to exit before relaunching; an
            // immediate child would be forwarded to this process and then lost.
            #[cfg(target_os = "windows")]
            {
                let executable = current.to_string_lossy().replace('\'', "''");
                let command = format!("Start-Sleep -Milliseconds 900; Start-Process -FilePath '{executable}'");
                Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command"]).arg(&command)
                    .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                    .spawn().map_err(|e| format!("Could not schedule Schoology restart: {e}"))?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                Command::new("sh").arg("-c").arg("sleep 1; exec \"$1\"").arg("schoology-restart").arg(current)
                    .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                    .spawn().map_err(|e| format!("Could not schedule Schoology restart: {e}"))?;
            }
            schedule_app_exit(app.clone(), 150);
            Ok(json!(true))
        },
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        "window-minimize" => { if let Some(window)=app.get_webview_window("main") { window.minimize().map_err(|e|e.to_string())?; } Ok(json!(true)) },
        #[cfg(any(target_os = "android", target_os = "ios"))]
        "window-minimize" => Ok(json!(false)),
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        "window-toggle-maximize" => { if let Some(window)=app.get_webview_window("main") { if window.is_maximized().unwrap_or(false) { window.unmaximize().map_err(|e|e.to_string())?; } else { window.maximize().map_err(|e|e.to_string())?; } } Ok(json!(true)) },
        #[cfg(any(target_os = "android", target_os = "ios"))]
        "window-toggle-maximize" => Ok(json!(false)),
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        "window-start-dragging" => { if let Some(window)=app.get_webview_window("main") { window.start_dragging().map_err(|e|e.to_string())?; } Ok(json!(true)) },
        #[cfg(any(target_os = "android", target_os = "ios"))]
        "window-start-dragging" => Ok(json!(false)),
        "window-close" => { if let Some(window)=app.get_webview_window("main") { window.close().map_err(|e|e.to_string())?; } Ok(json!(true)) },
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        "window-is-maximized" => Ok(json!(app.get_webview_window("main").and_then(|window|window.is_maximized().ok()).unwrap_or(false))),
        #[cfg(any(target_os = "android", target_os = "ios"))]
        "window-is-maximized" => Ok(json!(false)),
        "check-for-updates" => check_for_updates().await,
        "download-liquid-glass" => latest_alternate_release("tling0001/SchoologyDesktopLiquidGlass", "Schoology Liquid Glass").await,
        "download-expressive" => latest_alternate_release("tling0001/SchoologyDesktopM3E", "Schoology Expressive").await,
        "install-update" => install_update(&app, &args).await,
        "open-chrome-extension-folder" => {
            let mut folder = app.path().resource_dir().map_err(|e| e.to_string())?;
            folder.push("chrome-link-handler");
            if !folder.join("manifest.json").is_file() { return Err("The companion Chrome extension folder is not included in this installation.".into()); }
            app.opener().open_path(folder.to_string_lossy().as_ref(), None::<&str>).map_err(|e| e.to_string())?;
            Ok(json!(true))
        },
        "update-assignment-grade" => update_assignment_grade(&app, &state, &args).await,
        _ => Err(format!("Unsupported native operation: {name}")),
    }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--enable-features=OverlayScrollbar:mode/overlay");
    let builder = tauri::Builder::default();
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        // Keep desktop deep-link activations in the existing process.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            for arg in argv {
                let candidate = arg.trim_matches(|ch| ch == '"' || ch == '\'');
                let candidate = if candidate.starts_with("schoology://") {
                    Some(candidate)
                } else {
                    candidate.find("schoology://").map(|index| &candidate[index..])
                };
                if let Some(url_text) = candidate {
                    let url_text = url_text.split_whitespace().next().unwrap_or(url_text).trim_end_matches('"');
                    if Url::parse(url_text).is_ok() {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(handle_deep_link(handle, url_text.to_owned()));
                    }
                }
            }
        }))
        // Desktop WebView permission callback; mobile uses platform permissions.
        .on_permission_request(|_webview, kind| {
            if matches!(kind, PermissionKind::Camera | PermissionKind::Microphone) {
                PermissionResponse::Allow
            } else {
                PermissionResponse::Deny
            }
        });
    builder
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let overlay = read_json(app.handle(), "window-chrome.json", json!({})).get("overlay").and_then(Value::as_bool).unwrap_or(false);
                if overlay {
                    if let Some(window) = app.get_webview_window("main") {
                        window.set_decorations(false).map_err(|e| std::io::Error::other(format!("Could not enable window-controls overlay: {e}")))?;
                    }
                }
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let handle = handle.clone();
                    tauri::async_runtime::spawn(handle_deep_link(handle, url.to_string()));
                }
            });
            let notification_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                loop {
                    let state = notification_handle.state::<HostState>();
                    poll_notifications(&notification_handle, &state).await;
                    tokio::time::sleep(std::time::Duration::from_secs(5 * 60)).await;
                }
            });
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(8)).await;
                loop {
                    match check_for_updates().await {
                        Ok(info) if info.get("available").and_then(Value::as_bool).unwrap_or(false) => {
                            let _ = update_handle.emit("update-available", info);
                            tokio::time::sleep(std::time::Duration::from_secs(12 * 60 * 60)).await;
                        }
                        Ok(_) => tokio::time::sleep(std::time::Duration::from_secs(12 * 60 * 60)).await,
                        Err(_) => tokio::time::sleep(std::time::Duration::from_secs(5 * 60)).await,
                    }
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![schoology_invoke])
        .run(tauri::generate_context!())
        .expect("error while running Schoology Desktop Port");
}
