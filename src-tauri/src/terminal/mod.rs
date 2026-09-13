use crate::{
    filesystem::{Result, ServiceError},
    process::{Process, ProcessEvent, ProcessService},
};
use portable_pty::CommandBuilder;
use serde::Serialize;
use std::{collections::HashMap, path::Path};

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

impl TerminalService {
    pub fn start(
        &mut self,
        root: &Path,
        emit: impl Fn(TerminalEvent) + Clone + Send + 'static,
    ) -> Result<Terminal> {
        let mut command = CommandBuilder::new_default_prog();
        command.cwd(root);
        let shell = Path::new(&command.get_shell()).file_name().map_or_else(
            || "shell".to_string(),
            |name| name.to_string_lossy().into_owned(),
        );
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
    fn wait_for_output(receiver: &Receiver<TerminalEvent>, needle: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(20);
        let mut text = String::new();
        while Instant::now() < deadline {
            match receiver.recv_timeout(Duration::from_millis(250)) {
                Ok(TerminalEvent::Output { data, .. }) => text.push_str(&data),
                Ok(TerminalEvent::Exit { .. }) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => continue,
            }
            if text.contains(needle) {
                return true;
            }
        }
        text.contains(needle)
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
}
