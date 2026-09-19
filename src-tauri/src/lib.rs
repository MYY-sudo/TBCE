mod architecture;
mod commands;
mod filesystem;
mod git;
mod github;
mod process;
mod progress;
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
        .manage(commands::GitHub::default())
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
            commands::github_account,
            commands::github_sign_in,
            commands::github_sign_out,
            commands::github_link,
            commands::github_repository,
            commands::github_branches,
            commands::github_commits,
            commands::github_activity,
            commands::github_issues,
            commands::github_issue,
            commands::github_issue_choices,
            commands::github_pull_requests,
            commands::github_pull_request,
            commands::github_pull_files,
            commands::github_counts,
            commands::github_milestones,
            commands::github_head_checks,
            commands::github_area_issues,
            commands::github_create_issue,
            commands::github_close_issue,
            commands::github_reopen_issue,
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
            commands::read_progress,
            commands::write_progress,
            commands::start_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::stop_terminal,
            commands::restart_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("could not run TBCE");
}

#[cfg(test)]
mod tests {
    #[test]
    fn managed_services_have_distinct_state_keys() {
        use super::commands::{Backend, Git, GitHub, Templates, Terminals};
        use std::any::TypeId;
        // Tauri uses TypeId as its state key. A type alias does not make a new key
        // and causes startup to panic, even when service tests pass in isolation.
        let keys = [
            TypeId::of::<Backend>(),
            TypeId::of::<Terminals>(),
            TypeId::of::<Templates>(),
            TypeId::of::<Git>(),
            TypeId::of::<GitHub>(),
        ];
        let unique: std::collections::HashSet<_> = keys.into_iter().collect();
        assert_eq!(
            unique.len(),
            keys.len(),
            "managed service state keys collide"
        );
    }
}
