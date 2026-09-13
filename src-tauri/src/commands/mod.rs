use crate::filesystem::{Document, Entry, FileSystemService, Result, ServiceError, Workspace};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub type Backend = Mutex<FileSystemService>;
fn lock(state: &Backend) -> Result<std::sync::MutexGuard<'_, FileSystemService>> {
    state
        .lock()
        .map_err(|_| ServiceError::new("INTERNAL", "Workspace service is unavailable."))
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
