use crate::filesystem::{Result, ServiceError};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize, PtySystem};
use std::{
    fmt::Display,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

const READ_CHUNK: usize = 8 * 1024;
// ConPTY keeps the output pipe open while the master end lives, so a reader never sees EOF when the
// child exits. Trailing output is drained during this window instead of being ordered behind EOF.
const FLUSH_WINDOW: Duration = Duration::from_millis(120);
const STOP_LIMIT: Duration = Duration::from_secs(2);
const STOP_POLL: Duration = Duration::from_millis(10);
// ConPTY asks the terminal for its cursor position and waits for the answer before it starts the
// child process. xterm.js answers that on its own, so only tests have to stand in for a terminal.
#[cfg(test)]
pub(crate) const CURSOR_REPORT: &str = "\x1b[1;1R";

pub enum ProcessEvent {
    Output(String),
    Exit(u32),
}

pub struct Process {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    running: Arc<AtomicBool>,
}

pub struct ProcessService {
    system: Box<dyn PtySystem + Send>,
}

impl Default for ProcessService {
    fn default() -> Self {
        Self {
            system: native_pty_system(),
        }
    }
}

fn failed(error: impl Display) -> ServiceError {
    ServiceError::new("PROCESS_FAILED", error.to_string())
}
fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.max(1),
        rows: rows.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}
fn decode(buffer: &mut Vec<u8>) -> String {
    let mut text = String::new();
    loop {
        let error = match std::str::from_utf8(buffer) {
            Ok(valid) => {
                text.push_str(valid);
                buffer.clear();
                return text;
            }
            Err(error) => error,
        };
        let valid = error.valid_up_to();
        text.push_str(&String::from_utf8_lossy(&buffer[..valid]));
        match error.error_len() {
            // An incomplete trailing sequence waits for the read that completes it.
            None => {
                buffer.drain(..valid);
                return text;
            }
            Some(length) => {
                buffer.drain(..valid + length);
                text.push('\u{fffd}');
            }
        }
    }
}

impl ProcessService {
    pub fn spawn(
        &self,
        command: CommandBuilder,
        cols: u16,
        rows: u16,
        emit: impl Fn(ProcessEvent) + Clone + Send + 'static,
    ) -> Result<Process> {
        let pair = self.system.openpty(pty_size(cols, rows)).map_err(failed)?;
        let mut child = pair.slave.spawn_command(command).map_err(failed)?;
        // The slave only holds handles the spawned child no longer needs.
        drop(pair.slave);
        let killer = child.clone_killer();
        let writer = pair.master.take_writer().map_err(failed)?;
        let mut reader = pair.master.try_clone_reader().map_err(failed)?;
        let running = Arc::new(AtomicBool::new(true));
        let exited = running.clone();
        let output = emit.clone();
        thread::spawn(move || {
            let mut chunk = [0u8; READ_CHUNK];
            let mut buffer = Vec::new();
            while let Ok(count) = reader.read(&mut chunk) {
                if count == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..count]);
                let text = decode(&mut buffer);
                if !text.is_empty() {
                    output(ProcessEvent::Output(text));
                }
            }
        });
        thread::spawn(move || {
            let status = child.wait();
            exited.store(false, Ordering::Relaxed);
            thread::sleep(FLUSH_WINDOW);
            emit(ProcessEvent::Exit(
                status.map_or(1, |status| status.exit_code()),
            ));
        });
        Ok(Process {
            master: pair.master,
            writer,
            killer,
            running,
        })
    }
}

impl Process {
    pub fn running(&self) -> bool {
        self.running.load(Ordering::Relaxed)
    }
    pub fn write(&mut self, data: &str) -> Result<()> {
        self.writer.write_all(data.as_bytes())?;
        self.writer.flush()?;
        Ok(())
    }
    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.master.resize(pty_size(cols, rows)).map_err(failed)
    }
    pub fn kill(&mut self) -> Result<()> {
        // Terminating an already-exited process reports an operating-system error on Windows.
        if !self.running() {
            return Ok(());
        }
        // portable-pty reports a successful Windows termination as an error, so the outcome is
        // confirmed by watching the process rather than by trusting the returned status.
        let _ = self.killer.kill();
        let deadline = Instant::now() + STOP_LIMIT;
        while Instant::now() < deadline {
            if !self.running() {
                return Ok(());
            }
            thread::sleep(STOP_POLL);
        }
        Err(ServiceError::new(
            "STOP_FAILED",
            "The terminal process did not stop.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        sync::mpsc::{channel, Receiver, RecvTimeoutError},
    };
    const LIMIT: Duration = Duration::from_secs(20);
    fn script(command: &str) -> CommandBuilder {
        let mut builder = CommandBuilder::new(if cfg!(windows) { "cmd.exe" } else { "/bin/sh" });
        builder.args([if cfg!(windows) { "/C" } else { "-c" }, command]);
        builder
    }
    fn start(command: CommandBuilder) -> (Process, Receiver<ProcessEvent>) {
        let (sender, receiver) = channel();
        let mut process = ProcessService::default()
            .spawn(command, 80, 24, move |event| {
                let _ = sender.send(event);
            })
            .unwrap();
        process.write(CURSOR_REPORT).unwrap();
        (process, receiver)
    }
    fn wait_for_exit(receiver: &Receiver<ProcessEvent>) -> (String, u32) {
        let mut text = String::new();
        loop {
            match receiver.recv_timeout(LIMIT).unwrap() {
                ProcessEvent::Output(data) => text.push_str(&data),
                ProcessEvent::Exit(code) => return (text, code),
            }
        }
    }
    fn wait_for_output(receiver: &Receiver<ProcessEvent>, needle: &str) -> bool {
        let deadline = Instant::now() + LIMIT;
        let mut text = String::new();
        while Instant::now() < deadline {
            match receiver.recv_timeout(Duration::from_millis(250)) {
                Ok(ProcessEvent::Output(data)) => text.push_str(&data),
                Ok(ProcessEvent::Exit(_)) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => continue,
            }
            if text.contains(needle) {
                return true;
            }
        }
        text.contains(needle)
    }
    #[test]
    fn streams_output_and_reports_the_exit_code() {
        let (_process, events) = start(script("echo tbce-output"));
        let (text, code) = wait_for_exit(&events);
        assert!(text.contains("tbce-output"), "{text}");
        assert_eq!(code, 0);
        let (_process, events) = start(script("exit 3"));
        assert_eq!(wait_for_exit(&events).1, 3);
    }
    #[test]
    fn spawns_inside_the_requested_directory() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("probe"), b"").unwrap();
        let mut command = script(if cfg!(windows) {
            "if exist probe (exit 7) else (exit 8)"
        } else {
            "test -f probe && exit 7 || exit 8"
        });
        command.cwd(temp.path());
        let (_process, events) = start(command);
        assert_eq!(wait_for_exit(&events).1, 7);
    }
    #[test]
    fn accepts_input_and_stops_a_running_shell() {
        let (mut process, events) = start(CommandBuilder::new_default_prog());
        assert!(process.running());
        process.write("echo tbce-input\r\n").unwrap();
        assert!(wait_for_output(&events, "tbce-input"));
        process.resize(120, 40).unwrap();
        process.kill().unwrap();
        assert!(receives_exit(&events));
        assert!(!process.running());
        // Stopping a process that already exited stays successful.
        process.kill().unwrap();
    }
    fn receives_exit(receiver: &Receiver<ProcessEvent>) -> bool {
        let deadline = Instant::now() + LIMIT;
        while Instant::now() < deadline {
            match receiver.recv_timeout(Duration::from_millis(250)) {
                Ok(ProcessEvent::Exit(_)) => return true,
                Ok(ProcessEvent::Output(_)) | Err(RecvTimeoutError::Timeout) => continue,
                Err(RecvTimeoutError::Disconnected) => return false,
            }
        }
        false
    }
    #[test]
    fn decodes_multibyte_output_split_across_reads() {
        let mut buffer = vec![0xc3];
        assert_eq!(decode(&mut buffer), "");
        buffer.extend_from_slice(&[0xbc, b'x']);
        assert_eq!(decode(&mut buffer), "üx");
        buffer.extend_from_slice(&[0xff, b'y']);
        assert_eq!(decode(&mut buffer), "\u{fffd}y");
    }
}
