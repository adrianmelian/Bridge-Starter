use std::io::Write;
use serde_json::{Value, json};
use tauri::{Manager, WebviewUrl, LogicalPosition, LogicalSize, webview::{WebviewBuilder, NewWindowResponse, PageLoadEvent}};

pub fn emit(app: &tauri::AppHandle, event: Value) {
    if let Some(child) = app.state::<crate::Service>().0.lock().unwrap().as_mut() {
        if let Some(stdin) = child.stdin.as_mut() { let _ = writeln!(stdin, "{event}"); }
    }
}
fn valid_url(text: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(text).map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() { return Err("Use an http or https page without embedded credentials.".into()); }
    Ok(url)
}
fn label(id: &str) -> Result<String, String> {
    if id.len() != 36 || !id.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-') { return Err("Invalid browser tab.".into()); }
    Ok(format!("browser-{id}"))
}
// Called from the service reader thread: add_child must not block the UI thread.
pub fn handle(app: &tauri::AppHandle, event: &Value) -> Result<(), String> {
    let action = event["action"].as_str().unwrap_or("");
    if action != "sync" {
        let name = label(event["id"].as_str().unwrap_or(""))?;
        let Some(view) = app.get_webview(&name) else { return Ok(()) };
        return match action {
            "navigate" => view.navigate(valid_url(event["url"].as_str().unwrap_or(""))?),
            "reload" => view.reload(),
            "back" => view.eval("window.history.back()"),
            "forward" => view.eval("window.history.forward()"),
            _ => return Err("Unknown browser action.".into()),
        }.map_err(|e| e.to_string());
    }
    let tabs = event["tabs"].as_array().ok_or("Invalid tabs")?;
    if tabs.len() > 16 { return Err("Too many browser tabs".into()); }
    let labels: Vec<String> = tabs.iter().map(|t| label(t["id"].as_str().unwrap_or(""))).collect::<Result<_, _>>()?;
    for (name, view) in app.webviews() {
        if name.starts_with("browser-") {
            if labels.contains(&name) { let _ = view.hide(); } else { let _ = view.close(); }
        }
    }
    let Some(tab) = tabs.iter().find(|t| t["id"] == event["activeId"] && t["url"].as_str().is_some_and(|u| !u.is_empty())) else { return Ok(()) };
    let id = tab["id"].as_str().unwrap();
    let b = &event["bounds"];
    let (x,y,w,h) = (b["x"].as_f64().unwrap_or(-1.0), b["y"].as_f64().unwrap_or(-1.0), b["width"].as_f64().unwrap_or(0.0), b["height"].as_f64().unwrap_or(0.0));
    if x < 0.0 || y < 60.0 || w < 1.0 || h < 1.0 || [x,y,w,h].iter().any(|v| !v.is_finite() || *v > 30000.0) { return Err("Invalid browser bounds".into()); }
    let name = label(id)?;
    let view = if let Some(view) = app.get_webview(&name) { view } else {
        let nav_app = app.clone(); let nav_id = id.to_owned();
        let load_app = app.clone(); let load_id = id.to_owned();
        let title_app = app.clone(); let title_id = id.to_owned();
        let popup_app = app.clone();
        let builder = WebviewBuilder::new(&name, WebviewUrl::External(valid_url(tab["url"].as_str().unwrap())?))
            .disable_drag_drop_handler()
            .on_navigation(move |url| {
                if valid_url(url.as_str()).is_err() { return false; }
                emit(&nav_app, json!({"type":"browser-update","id":nav_id,"url":url.as_str(),"loading":true})); true
            })
            .on_page_load(move |_, payload| emit(&load_app, json!({"type":"browser-update","id":load_id,"url":payload.url().as_str(),"loading":matches!(payload.event(), PageLoadEvent::Started)})))
            .on_document_title_changed(move |_, title| emit(&title_app, json!({"type":"browser-update","id":title_id,"title":title})))
            .on_new_window(move |url, _| {
                if valid_url(url.as_str()).is_ok() { emit(&popup_app, json!({"type":"browser-popup","url":url.as_str()})); }
                NewWindowResponse::Deny
            });
        app.get_window("workspace").ok_or("Workspace is unavailable")?.add_child(builder, LogicalPosition::new(x,y), LogicalSize::new(w,h)).map_err(|e| e.to_string())?
    };
    view.set_auto_resize(false).map_err(|e| e.to_string())?;
    view.set_bounds(tauri::Rect { position: LogicalPosition::new(x,y).into(), size: LogicalSize::new(w,h).into() }).map_err(|e| e.to_string())?;
    view.show().map_err(|e| e.to_string())
}
