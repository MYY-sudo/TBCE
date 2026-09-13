use crate::filesystem::{Document, Entry, FileSystemService, Result, ServiceError, Workspace};
use crate::terminal::{Terminal, TerminalEvent, TerminalService};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

pub type Backend = Mutex<FileSystemService>;
pub type Terminals = Mutex<TerminalService>;
fn lock(state: &Backend) -> Result<std::sync::MutexGuard<'_, FileSystemService>> {
    state
        .lock()
        .map_err(|_| ServiceError::new("INTERNAL", "Workspace service is unavailable."))
}
fn lock_terminals(state: &Terminals) -> Result<std::sync::MutexGuard<'_, TerminalService>> {
    state
        .lock()
        .map_err(|_| ServiceError::new("INTERNAL", "Terminal service is unavailable."))
}
fn emitter(app: AppHandle) -> impl Fn(TerminalEvent) + Clone + Send + 'static {
    move |event| {
        let _ = app.emit("terminal:event", event);
    }
}

#[tauri::command]
pub async fn choose_workspace(
    app: AppHandle,
    state: State<'_, Backend>,
) -> Result<Option<Workspace>> {
    let path =
        tauri::async_runtime::spawn_blocking(move || app.dialog().file().blocking_pick_folder())
            .await
            .map_err(|e| ServiceError::new("DIALOG_ERROR", e.to_string()))?;
    match path {
        Some(path) => {
            Ok(Some(lock(&state)?.open(&path.into_path().map_err(
                |e| ServiceError::new("INVALID_PATH", e.to_string()),
            )?)?))
        }
        None => Ok(None),
    }
}
#[tauri::command]
pub async fn choose_file(
    app: AppHandle,
    state: State<'_, Backend>,
    workspace_id: String,
) -> Result<Option<String>> {
    let root = lock(&state)?.root_path(&workspace_id)?;
    let path = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_directory(root).blocking_pick_file()
    })
    .await
    .map_err(|e| ServiceError::new("DIALOG_ERROR", e.to_string()))?;
    match path {
        Some(path) => Ok(Some(
            lock(&state)?.relative(
                &workspace_id,
                &path
                    .into_path()
                    .map_err(|e| ServiceError::new("INVALID_PATH", e.to_string()))?,
            )?,
        )),
        None => Ok(None),
    }
}
#[tauri::command]
pub async fn list_directory(
    state: State<'_, Backend>,
    workspace_id: String,
    path: String,
) -> Result<Vec<Entry>> {
    lock(&state)?.list(&workspace_id, &path)
}
#[tauri::command]
pub async fn read_file(
    state: State<'_, Backend>,
    workspace_id: String,
    path: String,
) -> Result<Document> {
    lock(&state)?.read(&workspace_id, &path)
}
#[tauri::command]
pub async fn write_file(
    state: State<'_, Backend>,
    workspace_id: String,
    path: String,
    content: String,
    revision: String,
    bom: bool,
) -> Result<Document> {
    lock(&state)?.write(&workspace_id, &path, &content, &revision, bom)
}
#[tauri::command]
pub async fn create_entry(
    state: State<'_, Backend>,
    workspace_id: String,
    path: String,
    directory: bool,
) -> Result<()> {
    lock(&state)?.create(&workspace_id, &path, directory)
}
#[tauri::command]
pub async fn rename_entry(
    state: State<'_, Backend>,
    workspace_id: String,
    from: String,
    to: String,
) -> Result<()> {
    lock(&state)?.rename(&workspace_id, &from, &to)
}
#[tauri::command]
pub async fn trash_entry(
    app: AppHandle,
    state: State<'_, Backend>,
    workspace_id: String,
    path: String,
) -> Result<bool> {
    // The backend also confirms, so invoking the command cannot bypass the destructive-action prompt.
    lock(&state)?.root_path(&workspace_id)?;
    let message = format!("Move \"{path}\" to the Recycle Bin? This includes its contents.");
    let confirmed = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("Move to Recycle Bin")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show()
    })
    .await
    .map_err(|e| ServiceError::new("DIALOG_ERROR", e.to_string()))?;
    if confirmed {
        lock(&state)?.trash(&workspace_id, &path)?;
    }
    Ok(confirmed)
}
#[tauri::command]
pub async fn start_terminal(
    app: AppHandle,
    state: State<'_, Backend>,
    terminals: State<'_, Terminals>,
    workspace_id: String,
) -> Result<Terminal> {
    // The working directory comes from the open workspace, never from a path supplied by the webview.
    let root = lock(&state)?.root_path(&workspace_id)?;
    lock_terminals(&terminals)?.start(&root, emitter(app))
}
#[tauri::command]
pub async fn write_terminal(
    terminals: State<'_, Terminals>,
    id: String,
    data: String,
) -> Result<()> {
    lock_terminals(&terminals)?.write(&id, &data)
}
#[tauri::command]
pub async fn resize_terminal(
    terminals: State<'_, Terminals>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<()> {
    lock_terminals(&terminals)?.resize(&id, cols, rows)
}
#[tauri::command]
pub async fn stop_terminal(terminals: State<'_, Terminals>, id: String) -> Result<()> {
    lock_terminals(&terminals)?.stop(&id)
}
#[tauri::command]
pub async fn restart_terminal(
    app: AppHandle,
    state: State<'_, Backend>,
    terminals: State<'_, Terminals>,
    workspace_id: String,
    id: String,
) -> Result<Terminal> {
    let root = lock(&state)?.root_path(&workspace_id)?;
    lock_terminals(&terminals)?.restart(&id, &root, emitter(app))
}
