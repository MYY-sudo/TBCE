mod architecture;
mod commands;
mod filesystem;
mod git;
mod process;
mod project;
mod templates;
mod terminal;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::Backend::default())
        .manage(commands::Terminals::default())
        .manage(commands::Templates::default())
        .manage(commands::Git::default())
        .on_window_event(|window, event| {
            // Shell processes keep running after the window is gone unless they are stopped here.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut terminals) = window.state::<commands::Terminals>().lock() {
                    terminals.stop_all();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::git_clone_repository,
            commands::git_fetch,
            commands::git_pull,
            commands::git_push,
            commands::git_stage,
            commands::git_stage_all,
            commands::git_unstage,
            commands::git_commit,
            commands::git_create_branch,
            commands::git_checkout_branch,
            commands::git_delete_branch,
            commands::git_history,
            commands::git_diff,
            commands::git_diff_summary,
            commands::git_detect_repository,
            commands::git_init_repository,
            commands::git_status,
            commands::git_branches,
            commands::list_architectures,
            commands::get_architecture,
            commands::save_architecture,
            commands::delete_architecture,
            commands::preview_project_structure,
            commands::list_stacks,
            commands::inspect_stack_source,
            commands::save_stack,
            commands::edit_stack,
            commands::delete_stack,
            commands::create_project_from_stack,
            commands::choose_workspace,
            commands::choose_file,
            commands::list_directory,
            commands::read_file,
            commands::write_file,
            commands::create_entry,
            commands::rename_entry,
            commands::trash_entry,
            commands::detect_project,
            commands::init_project,
            commands::update_project,
            commands::open_recent_project,
            commands::start_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::stop_terminal,
            commands::restart_terminal
        ])
        .run(tauri::generate_context!())
        .expect("could not run TBCE");
}
