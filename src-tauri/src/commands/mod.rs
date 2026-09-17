use crate::architecture::{Architecture, ArchitectureFields, ArchitectureService, Preview};
use crate::filesystem::{Document, Entry, FileSystemService, Result, ServiceError, Workspace};
use crate::git::{self, GitService};
use crate::github::{self, GitHubService};
use crate::project::{Project, ProjectDetection, ProjectFields, ProjectService};
use crate::templates::{Catalog, SourceEntry, Stack, StackFields, TemplateService};
use crate::terminal::{Terminal, TerminalEvent, TerminalService};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub type Backend = Mutex<FileSystemService>;
pub type Terminals = Mutex<TerminalService>;
// Tauri keys managed state by concrete type; aliases of Mutex<()> collide.
#[derive(Default)]
pub struct Templates(Mutex<()>);
#[derive(Default)]
pub struct Git(Mutex<()>);
/// Unlike the two locks above, this one guards a service that holds state: the conditional-request
/// cache. Its concrete type is therefore a key of its own without needing a newtype.
#[derive(Default)]
pub struct GitHub(Mutex<GitHubService>);

fn architecture_service(app: &AppHandle) -> Result<ArchitectureService> {
    ArchitectureService::new(
        app.path()
            .app_data_dir()
            .map_err(|e| ServiceError::new("IO_ERROR", e.to_string()))?
            .join("architectures"),
    )
}
// Share the template library lock: preview, creation and both catalogs see a coherent selection.
#[tauri::command]
pub async fn list_architectures(app: AppHandle) -> Result<crate::architecture::Catalog> {
    template_task(app, |_, app| architecture_service(&app)?.list()).await
}
#[tauri::command]
pub async fn get_architecture(app: AppHandle, id: String) -> Result<Architecture> {
    template_task(app, move |_, app| architecture_service(&app)?.get(&id)).await
}
#[tauri::command]
pub async fn save_architecture(
    app: AppHandle,
    id: Option<String>,
    fields: ArchitectureFields,
) -> Result<Architecture> {
    template_task(app, move |_, app| {
        architecture_service(&app)?.save(id.as_deref(), fields)
    })
    .await
}
#[tauri::command]
pub async fn delete_architecture(app: AppHandle, id: String) -> Result<bool> {
    template_task(app, move |_, app| {
        if !app.dialog().message("Move this saved architecture to the Recycle Bin? Existing projects will stay unchanged.").title("Delete saved architecture").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).blocking_show() { return Ok(false); }
        architecture_service(&app)?.delete(&id)?;
        Ok(true)
    }).await
}
#[tauri::command]
pub async fn preview_project_structure(
    app: AppHandle,
    stack_id: Option<String>,
    architecture_id: Option<String>,
) -> Result<Preview> {
    template_task(app, move |service, app| {
        let stack = stack_id.as_deref().map(|id| service.get(id)).transpose()?;
        let architecture = architecture_id
            .as_deref()
            .map(|id| architecture_service(&app)?.get(id))
            .transpose()?;
        crate::architecture::preview(
            stack.as_ref().map(|s| s.entries.as_slice()).unwrap_or(&[]),
            architecture.as_ref(),
        )
    })
    .await
}

async fn template_task<T: Send + 'static>(
    app: AppHandle,
    task: impl FnOnce(TemplateService, AppHandle) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Templates>();
        let _guard = state
            .0
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
    architecture_id: Option<String>,
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
        let architecture = architecture_id
            .as_deref()
            .map(|id| architecture_service(&app)?.get(id))
            .transpose()?;
        let path = service.create_with_architecture(
            &parent,
            fields,
            stack_id.as_deref(),
            architecture.as_ref(),
        )?;
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
/// Serializes repository operations. The workspace root is resolved only after the Git lock is
/// held -- that queue wait is exactly when a workspace switch can land, so staleness is caught
/// here -- and the filesystem guard is released before Git runs, so a slow repository never
/// blocks saving a file.
async fn git_task<T: Send + 'static>(
    app: AppHandle,
    workspace_id: String,
    task: impl FnOnce(PathBuf, &AppHandle) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Git>();
        let _guard = state
            .0
            .lock()
            .map_err(|_| ServiceError::new("INTERNAL", "Git service is unavailable."))?;
        let root = lock(&app.state::<Backend>())?.root_path(&workspace_id)?;
        task(root, &app)
    })
    .await
    .map_err(|e| ServiceError::new("INTERNAL", e.to_string()))?
}

/// The project manifest only ever supplies a fallback name for the default branch.
fn recorded_default(root: &Path) -> Option<String> {
    match ProjectService::detect(root) {
        Ok(ProjectDetection::Found { manifest, .. }) => manifest.default_branch.clone(),
        _ => None,
    }
}

#[tauri::command]
pub async fn git_clone_repository(
    app: AppHandle,
    workspace_id: Option<String>,
    source: String,
    folder: String,
) -> Result<Option<git::CloneOutcome>> {
    // Cloning needs no open workspace, so this is the one Git command that does not resolve one.
    // The destination parent still comes from a native picker, never from the webview.
    let _ = workspace_id;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Git>();
        let _guard = state
            .0
            .lock()
            .map_err(|_| ServiceError::new("INTERNAL", "Git service is unavailable."))?;
        git::validate_remote(&source)?;
        let Some(parent) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let parent = parent
            .into_path()
            .map_err(|e| ServiceError::new("INVALID_PATH", e.to_string()))?;
        // The clone is reported, not opened: switching workspaces stays an explicit user action.
        git::clone(&source, &parent, &folder).map(Some)
    })
    .await
    .map_err(|e| ServiceError::new("INTERNAL", e.to_string()))?
}
#[tauri::command]
pub async fn git_fetch(
    app: AppHandle,
    workspace_id: String,
    remote: Option<String>,
) -> Result<git::Status> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.fetch(remote.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn git_pull(app: AppHandle, workspace_id: String) -> Result<git::Status> {
    git_task(app, workspace_id, |root, _| GitService::open(&root)?.pull()).await
}
#[tauri::command]
pub async fn git_push(
    app: AppHandle,
    workspace_id: String,
    set_upstream: bool,
) -> Result<git::Status> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.push(set_upstream)
    })
    .await
}

#[tauri::command]
pub async fn git_stage(
    app: AppHandle,
    workspace_id: String,
    paths: Vec<String>,
) -> Result<git::Status> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.stage(&paths)
    })
    .await
}
#[tauri::command]
pub async fn git_stage_all(app: AppHandle, workspace_id: String) -> Result<git::Status> {
    git_task(app, workspace_id, |root, _| {
        GitService::open(&root)?.stage_all()
    })
    .await
}
#[tauri::command]
pub async fn git_unstage(
    app: AppHandle,
    workspace_id: String,
    paths: Vec<String>,
) -> Result<git::Status> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.unstage(&paths)
    })
    .await
}
#[tauri::command]
pub async fn git_commit(
    app: AppHandle,
    workspace_id: String,
    message: String,
) -> Result<git::Commit> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.commit(&message)
    })
    .await
}
#[tauri::command]
pub async fn git_create_branch(
    app: AppHandle,
    workspace_id: String,
    name: String,
    start_point: Option<String>,
) -> Result<git::Branches> {
    git_task(app, workspace_id, move |root, _| {
        let service = GitService::open(&root)?;
        service.create_branch(&name, start_point.as_deref())?;
        service.branches(recorded_default(&root).as_deref())
    })
    .await
}
#[tauri::command]
pub async fn git_checkout_branch(
    app: AppHandle,
    workspace_id: String,
    name: String,
) -> Result<git::Status> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.checkout(&name)
    })
    .await
}
#[tauri::command]
pub async fn git_delete_branch(app: AppHandle, workspace_id: String, name: String) -> Result<bool> {
    git_task(app, workspace_id, move |root, app| {
        // The backend confirms too, so invoking the command cannot bypass the destructive prompt.
        let service = GitService::open(&root)?;
        let message =
            format!("Delete the branch \"{name}\"? Commits only on this branch may be lost.");
        let confirmed = app
            .dialog()
            .message(message)
            .title("Delete branch")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .blocking_show();
        if !confirmed {
            return Ok(false);
        }
        service.delete_branch(&name, recorded_default(&root).as_deref())?;
        Ok(true)
    })
    .await
}
#[tauri::command]
pub async fn git_history(
    app: AppHandle,
    workspace_id: String,
    skip: u32,
    limit: u32,
    path: Option<String>,
) -> Result<git::History> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.history(skip, limit, path.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn git_diff(
    app: AppHandle,
    workspace_id: String,
    path: String,
    staged: bool,
) -> Result<git::FileDiff> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.diff(&path, staged)
    })
    .await
}
#[tauri::command]
pub async fn git_diff_summary(
    app: AppHandle,
    workspace_id: String,
    staged: bool,
) -> Result<Vec<git::DiffStat>> {
    git_task(app, workspace_id, move |root, _| {
        GitService::open(&root)?.diff_summary(staged)
    })
    .await
}

#[tauri::command]
pub async fn git_detect_repository(app: AppHandle, workspace_id: String) -> Result<git::Detection> {
    git_task(app, workspace_id, |root, _| Ok(GitService::detect(&root))).await
}
#[tauri::command]
pub async fn git_init_repository(
    app: AppHandle,
    workspace_id: String,
    default_branch: Option<String>,
) -> Result<git::Repository> {
    git_task(app, workspace_id, move |root, _| {
        git::init(&root, default_branch.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn git_status(app: AppHandle, workspace_id: String) -> Result<git::Status> {
    git_task(app, workspace_id, |root, _| {
        GitService::open(&root)?.status()
    })
    .await
}
#[tauri::command]
pub async fn git_branches(app: AppHandle, workspace_id: String) -> Result<git::Branches> {
    git_task(app, workspace_id, |root, _| {
        GitService::open(&root)?.branches(recorded_default(&root).as_deref())
    })
    .await
}

/// Serializes GitHub reads and owns the conditional-request cache. This lock is never held while
/// the Git lock is taken: the repository is identified first and released, then the request is
/// made, so a slow answer from GitHub cannot block staging a file.
async fn github_task<T: Send + 'static>(
    app: AppHandle,
    task: impl FnOnce(&mut GitHubService) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<GitHub>();
        let mut service = state
            .0
            .lock()
            .map_err(|_| ServiceError::new("INTERNAL", "GitHub service is unavailable."))?;
        task(&mut service)
    })
    .await
    .map_err(|e| ServiceError::new("INTERNAL", e.to_string()))?
}

/// Which repository the open folder belongs to. The webview never supplies this: it is read from
/// the workspace's own Git remote under the Git lock, which is released before anything is sent.
async fn linked(app: &AppHandle, workspace_id: String) -> Result<(String, String)> {
    git_task(app.clone(), workspace_id, |root, _| github::linked(&root)).await
}

#[tauri::command]
pub async fn github_account(app: AppHandle) -> Result<github::Account> {
    github_task(app, |service| service.account()).await
}
#[tauri::command]
pub async fn github_sign_in(app: AppHandle, token: String) -> Result<github::Account> {
    // The only command that accepts a token. Nothing ever returns one.
    github_task(app, move |service| service.sign_in(&token)).await
}
#[tauri::command]
pub async fn github_sign_out(app: AppHandle) -> Result<()> {
    github_task(app, |service| service.sign_out()).await
}
#[tauri::command]
pub async fn github_link(app: AppHandle, workspace_id: String) -> Result<github::Link> {
    // Runs Git and no network, so opening the panel never waits on a request to find out whether
    // there is anything to request.
    git_task(app, workspace_id, |root, _| Ok(github::link(&root))).await
}
#[tauri::command]
pub async fn github_repository(app: AppHandle, workspace_id: String) -> Result<github::Repository> {
    let (owner, repo) = linked(&app, workspace_id).await?;
    github_task(app, move |service| service.repository(&owner, &repo)).await
}
#[tauri::command]
pub async fn github_branches(
    app: AppHandle,
    workspace_id: String,
    page: u32,
) -> Result<github::Page<github::Branch>> {
    let (owner, repo) = linked(&app, workspace_id).await?;
    github_task(app, move |service| service.branches(&owner, &repo, page)).await
}
#[tauri::command]
pub async fn github_commits(
    app: AppHandle,
    workspace_id: String,
    page: u32,
    reference: Option<String>,
) -> Result<github::Page<github::Commit>> {
    let (owner, repo) = linked(&app, workspace_id).await?;
    github_task(app, move |service| {
        service.commits(&owner, &repo, reference.as_deref(), page)
    })
    .await
}
#[tauri::command]
pub async fn github_activity(
    app: AppHandle,
    workspace_id: String,
    page: u32,
) -> Result<github::Page<github::Activity>> {
    let (owner, repo) = linked(&app, workspace_id).await?;
    github_task(app, move |service| service.activity(&owner, &repo, page)).await
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
