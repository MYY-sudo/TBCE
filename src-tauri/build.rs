fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "choose_workspace",
            "choose_file",
            "list_directory",
            "read_file",
            "write_file",
            "create_entry",
            "rename_entry",
            "trash_entry",
        ]),
    ))
    .expect("could not build TBCE capabilities");
}
