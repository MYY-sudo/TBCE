mod commands;
mod filesystem;
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
        .on_window_event(|window, event| {
            // Shell processes keep running after the window is gone unless they are stopped here.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Ok(mut terminals) = window.state::<commands::Terminals>().lock() {
                    terminals.stop_all();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
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
