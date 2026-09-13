mod commands;
mod filesystem;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::Backend::default())
        .invoke_handler(tauri::generate_handler![
            commands::choose_workspace,
            commands::choose_file,
            commands::list_directory,
            commands::read_file,
            commands::write_file,
            commands::create_entry,
            commands::rename_entry,
            commands::trash_entry
        ])
        .run(tauri::generate_context!())
        .expect("could not run TBCE");
}
