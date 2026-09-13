use crate::{
    filesystem::{Result, ServiceError},
    process::{Process, ProcessEvent, ProcessService},
};
use portable_pty::CommandBuilder;
use serde::Serialize;
use std::{collections::HashMap, ffi::OsStr, path::Path};

const COLS: u16 = 80;
const ROWS: u16 = 24;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Terminal {
    pub id: String,
    pub shell: String,
}
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TerminalEvent {
    Output { id: String, data: String },
    Exit { id: String, code: u32 },
}

#[derive(Default)]
pub struct TerminalService {
    processes: ProcessService,
    sessions: HashMap<String, Process>,
    generation: u64,
}

fn shell_name(program: &OsStr) -> String {
    Path::new(program).file_name().map_or_else(
        || "shell".to_string(),
        |name| name.to_string_lossy().into_owned(),
    )
}

fn shell_working_directory(root: &Path) -> std::borrow::Cow<'_, Path> {
    #[cfg(windows)]
    {
        use std::{
            ffi::OsString,
            os::windows::ffi::{OsStrExt, OsStringExt},
            path::{Component, PathBuf, Prefix},
        };
        if matches!(
            root.components().next(),
            Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::VerbatimDisk(_))
        ) {
            // canonicalize adds \\?\ to local drive paths, but CMD rejects that cwd.
            // Strip only that prefix, preserving the remaining Windows path verbatim.
            let path: Vec<u16> = root.as_os_str().encode_wide().skip(4).collect();
            return std::borrow::Cow::Owned(PathBuf::from(OsString::from_wide(&path)));
        }
    }
    std::borrow::Cow::Borrowed(root)
}

// ConPTY hands the shell the machine's OEM code page, which on most installations cannot represent
// every character a workspace path or a tool's output contains. `ProcessService` decodes the pty as
// UTF-8, so the shell is asked to emit UTF-8 rather than the decoder being made lenient.
#[cfg(windows)]
fn shell_command() -> (CommandBuilder, String) {
    let program = std::env::var_os("ComSpec").unwrap_or_else(|| "cmd.exe".into());
    let shell = shell_name(&program);
    let mut command = CommandBuilder::new(&program);
    match shell.to_ascii_lowercase().as_str() {
        "cmd.exe" => command.args(["/K", "chcp", "65001", ">nul"]),
        "powershell.exe" | "pwsh.exe" => command.args([
            "-NoExit",
            "-Command",
            "[Console]::OutputEncoding=[Console]::InputEncoding=[System.Text.UTF8Encoding]::new()",
        ]),
        // An unrecognized shell keeps whatever encoding it starts with.
        _ => {}
    }
    (command, shell)
}

#[cfg(not(windows))]
fn shell_command() -> (CommandBuilder, String) {
    let command = CommandBuilder::new_default_prog();
    let shell = shell_name(OsStr::new(&command.get_shell()));
    (command, shell)
}

impl TerminalService {
    pub fn start(
        &mut self,
        root: &Path,
        emit: impl Fn(TerminalEvent) + Clone + Send + 'static,
    ) -> Result<Terminal> {
        let (mut command, shell) = shell_command();
        command.cwd(shell_working_directory(root).as_ref());
        self.generation += 1;
        let id = self.generation.to_string();
        let session = id.clone();
        let process = self.processes.spawn(command, COLS, ROWS, move |event| {
            emit(match event {
                ProcessEvent::Output(data) => TerminalEvent::Output {
                    id: session.clone(),
                    data,
                },
                ProcessEvent::Exit(code) => TerminalEvent::Exit {
                    id: session.clone(),
                    code,
                },
            })
        })?;
        self.sessions.insert(id.clone(), process);
        Ok(Terminal { id, shell })
    }
    fn session(&mut self, id: &str) -> Result<&mut Process> {
        self.sessions
            .get_mut(id)
            .ok_or_else(|| ServiceError::new("NO_TERMINAL", "This terminal is no longer open."))
    }
    pub fn write(&mut self, id: &str, data: &str) -> Result<()> {
        self.session(id)?.write(data)
    }
    pub fn resize(&mut self, id: &str, cols: u16, rows: u16) -> Result<()> {
        self.session(id)?.resize(cols, rows)
    }
    pub fn stop(&mut self, id: &str) -> Result<()> {
        self.session(id)?.kill()?;
        self.sessions.remove(id);
        Ok(())
    }
    pub fn restart(
        &mut self,
        id: &str,
        root: &Path,
        emit: impl Fn(TerminalEvent) + Clone + Send + 'static,
    ) -> Result<Terminal> {
        self.stop(id)?;
        self.start(root, emit)
    }
    pub fn stop_all(&mut self) {
        for (_, mut process) in self.sessions.drain() {
            let _ = process.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::process::CURSOR_REPORT;
    use std::{
        fs,
        sync::mpsc::{channel, Receiver, RecvTimeoutError},
        time::{Duration, Instant},
    };
    fn output_until(receiver: &Receiver<TerminalEvent>, needle: &str) -> String {
        let deadline = Instant::now() + Duration::from_secs(20);
        let mut text = String::new();
        while Instant::now() < deadline {
            match receiver.recv_timeout(Duration::from_millis(250)) {
                Ok(TerminalEvent::Output { data, .. }) => text.push_str(&data),
                Ok(TerminalEvent::Exit { .. }) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => continue,
            }
            if text.contains(needle) {
                break;
            }
        }
        text
    }
    fn wait_for_output(receiver: &Receiver<TerminalEvent>, needle: &str) -> bool {
        output_until(receiver, needle).contains(needle)
    }
    #[cfg(windows)]
    #[test]
    fn shell_cwd_converts_only_verbatim_drive_paths() {
        for (input, expected) in [
            (
                r"\\?\C:\Users\Masaüstü\yeni proje",
                r"C:\Users\Masaüstü\yeni proje",
            ),
            (r"\\?\C:\", r"C:\"),
            (
                r"C:\Users\Masaüstü\yeni proje",
                r"C:\Users\Masaüstü\yeni proje",
            ),
            (r"\\server\share\folder", r"\\server\share\folder"),
            (
                r"\\?\UNC\server\share\folder",
                r"\\?\UNC\server\share\folder",
            ),
            (r"\\.\C:\folder", r"\\.\C:\folder"),
        ] {
            assert_eq!(
                shell_working_directory(Path::new(input)).as_os_str(),
                OsStr::new(expected)
            );
        }
    }
    #[cfg(windows)]
    #[test]
    fn canonical_workspace_is_used_on_start_and_restart() {
        let temp = tempfile::tempdir().unwrap();
        let workspace = temp.path().join("Masaüstü yeni ğüşıöç");
        fs::create_dir(&workspace).unwrap();
        fs::write(workspace.join("tbce-probe-file"), b"").unwrap();
        let root = fs::canonicalize(&workspace).unwrap();
        let mut service = TerminalService::default();
        let (sender, receiver) = channel();
        let first = service
            .start(&root, move |event| {
                let _ = sender.send(event);
            })
            .unwrap();
        service.write(&first.id, CURSOR_REPORT).unwrap();
        service.write(&first.id, "dir /b tbce-probe*\r\n").unwrap();
        let first_output = output_until(&receiver, "tbce-probe-file");

        let (sender, receiver) = channel();
        let second = service
            .restart(&first.id, &root, move |event| {
                let _ = sender.send(event);
            })
            .unwrap();
        service.write(&second.id, CURSOR_REPORT).unwrap();
        service.write(&second.id, "dir /b tbce-probe*\r\n").unwrap();
        let second_output = output_until(&receiver, "tbce-probe-file");
        service.stop(&second.id).unwrap();

        assert_ne!(first.id, second.id);
        for output in [first_output, second_output] {
            assert!(
                output.contains("tbce-probe-file"),
                "Wrong terminal cwd: {output}"
            );
            assert!(!output.contains("UNC paths are not supported"), "{output}");
            assert!(
                !output.contains("Defaulting to Windows directory"),
                "{output}"
            );
        }
    }
    #[test]
    fn runs_a_shell_inside_the_workspace_and_tracks_its_session() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("tbce-probe-file"), b"").unwrap();
        let (sender, receiver) = channel();
        let mut service = TerminalService::default();
        let terminal = service
            .start(temp.path(), move |event| {
                let _ = sender.send(event);
            })
            .unwrap();
        assert!(!terminal.shell.is_empty());
        service.write(&terminal.id, CURSOR_REPORT).unwrap();
        assert_eq!(
            service.write("missing", "dir\r\n").err().unwrap().code,
            "NO_TERMINAL"
        );
        service.resize(&terminal.id, 200, 40).unwrap();
        // The listing only matches when the shell started in the workspace, and the echoed
        // command cannot contain the expanded name.
        let command = if cfg!(windows) {
            "dir /b tbce-probe*\r\n"
        } else {
            "ls tbce-probe*\n"
        };
        service.write(&terminal.id, command).unwrap();
        assert!(wait_for_output(&receiver, "tbce-probe-file"));
        service.stop(&terminal.id).unwrap();
        assert_eq!(
            service.stop(&terminal.id).err().unwrap().code,
            "NO_TERMINAL"
        );
    }
    #[test]
    fn restart_replaces_the_session_and_stop_all_clears_them() {
        let temp = tempfile::tempdir().unwrap();
        let mut service = TerminalService::default();
        let first = service.start(temp.path(), |_| {}).unwrap();
        service.write(&first.id, CURSOR_REPORT).unwrap();
        let second = service.restart(&first.id, temp.path(), |_| {}).unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!(service.sessions.len(), 1);
        service.stop_all();
        assert!(service.sessions.is_empty());
    }
    // `type` streams the file's raw UTF-8 bytes at the console, which decodes them with its code
    // page. Characters outside that code page only survive when the session really is in UTF-8.
    #[cfg(windows)]
    #[test]
    fn shell_output_round_trips_turkish_characters() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("probe.txt"), "ğüşıöç-probe").unwrap();
        let (sender, receiver) = channel();
        let mut service = TerminalService::default();
        let terminal = service
            .start(temp.path(), move |event| {
                let _ = sender.send(event);
            })
            .unwrap();
        service.write(&terminal.id, CURSOR_REPORT).unwrap();
        service.write(&terminal.id, "type probe.txt\r\n").unwrap();
        assert!(wait_for_output(&receiver, "ğüşıöç-probe"));
        service.stop(&terminal.id).unwrap();
    }
}
