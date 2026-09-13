use crate::filesystem::{Document, Entry, FileSystemService, Result, ServiceError, Workspace};
use crate::project::{Project, ProjectDetection, ProjectFields, ProjectService};
use crate::templates::{Catalog, SourceEntry, Stack, StackFields, TemplateService};
use crate::terminal::{Terminal, TerminalEvent, TerminalService};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub type Backend = Mutex<FileSystemService>;
pub type Terminals = Mutex<TerminalService>;
pub type Templates = Mutex<()>;

async fn template_task<T: Send + 'static>(
    app: AppHandle,
    task: impl FnOnce(TemplateService, AppHandle) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Templates>();
        let _guard = state
            .lock()
            .map_err(|_| ServiceError::new("INTERNAL", "Stack library is unavailable."))?;
        let root = app
            .path()
            .app_data_dir()
            .map_err(|e| ServiceError::new("IO_ERROR", e.to_string()))?
            .join("stacks");
        task(TemplateService::new(root)?, app.clone())
    })
    .await
    .map_err(|e| ServiceError::new("INTERNAL", e.to_string()))?
}

#[tauri::command]
pub async fn list_stacks(app: AppHandle) -> Result<Catalog> {
    template_task(app, |service, _| service.list()).await
}
#[tauri::command]
pub async fn inspect_stack_source(
    app: AppHandle,
    workspace_id: String,
    path: String,
) -> Result<Vec<SourceEntry>> {
    template_task(app, move |_, app| {
        let state = app.state::<Backend>();
        let backend = lock(&state)?;
        TemplateService::inspect(&backend.root_path(&workspace_id)?, &path)
    })
    .await
}
#[tauri::command]
pub async fn save_stack(
    app: AppHandle,
    workspace_id: String,
    id: Option<String>,
    fields: StackFields,
    entries: Vec<SourceEntry>,
) -> Result<Option<Stack>> {
    template_task(app, move |service, app| {
        if id.is_some() && !app.dialog().message("Replace this stack's saved files and defaults with the selected project snapshot? Existing projects will stay unchanged.").title("Replace saved stack").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).blocking_show() { return Ok(None); }
        let state = app.state::<Backend>();
        let backend = lock(&state)?;
        service.save(&backend.root_path(&workspace_id)?, id.as_deref(), fields, entries).map(Some)
    }).await
}
#[tauri::command]
pub async fn edit_stack(app: AppHandle, id: String, fields: StackFields) -> Result<Stack> {
    template_task(app, move |service, _| service.edit(&id, fields)).await
}
#[tauri::command]
pub async fn delete_stack(app: AppHandle, id: String) -> Result<bool> {
    template_task(app, move |service, app| {
        if !app.dialog().message("Move this saved stack to the Recycle Bin? Projects created from it will stay unchanged.").title("Delete saved stack").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).blocking_show() { return Ok(false); }
        service.delete(&id)?;
        Ok(true)
    }).await
}
#[tauri::command]
pub async fn create_project_from_stack(
    app: AppHandle,
    workspace_id: Option<String>,
    stack_id: Option<String>,
    fields: ProjectFields,
) -> Result<Option<Workspace>> {
    template_task(app, move |service, app| {
        let Some(parent) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let parent = parent
            .into_path()
            .map_err(|e| ServiceError::new("INVALID_PATH", e.to_string()))?;
        let state = app.state::<Backend>();
        let mut backend = lock(&state)?;
        if backend.current_id() != workspace_id.as_deref() {
            return Err(ServiceError::new(
                "STALE_WORKSPACE",
                "The workspace changed. Try creating the project again.",
            ));
        }
        let path = service.create(&parent, fields, stack_id.as_deref())?;
        backend.open(&path).map(Some).map_err(|e| {
            ServiceError::new(
                "OPEN_FAILED",
                format!(
                    "Project created at {}, but could not be opened: {}",
                    path.display(),
                    e.message
                ),
            )
        })
    })
    .await
}
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
pub async fn detect_project(
    state: State<'_, Backend>,
    workspace_id: String,
) -> Result<ProjectDetection> {
    let root = lock(&state)?.root_path(&workspace_id)?;
    ProjectService::detect(&root)
}
#[tauri::command]
pub async fn init_project(
    state: State<'_, Backend>,
    workspace_id: String,
    fields: ProjectFields,
) -> Result<Project> {
    let root = lock(&state)?.root_path(&workspace_id)?;
    ProjectService::init(&root, fields)
}
#[tauri::command]
pub async fn update_project(
    state: State<'_, Backend>,
    workspace_id: String,
    fields: ProjectFields,
) -> Result<Project> {
    let root = lock(&state)?.root_path(&workspace_id)?;
    ProjectService::update(&root, fields)
}
#[tauri::command]
pub async fn open_recent_project(state: State<'_, Backend>, path: String) -> Result<Workspace> {
    // Recent entries come from folders this application already opened, and opening one still
    // canonicalizes and checks the path exactly like the native picker path does.
    lock(&state)?.open(Path::new(&path))
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
