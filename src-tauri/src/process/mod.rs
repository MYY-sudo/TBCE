use crate::filesystem::{Result, ServiceError};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize, PtySystem};
use std::{
    borrow::Cow,
    ffi::{OsStr, OsString},
    fmt::Display,
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, Receiver},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

const READ_CHUNK: usize = 8 * 1024;
/// Captured output is bounded so a runaway child cannot exhaust memory.
pub const CAPTURE_CAP: usize = 8 * 1024 * 1024;
const WAIT_POLL: Duration = Duration::from_millis(10);
// A child's own exit does not prove its readers finished: a grandchild can inherit the pipe and
// hold it open. Waiting briefly collects ordinary trailing output without hanging the caller.
const DRAIN_WINDOW: Duration = Duration::from_millis(500);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
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

// Canonicalized local drive paths carry a \\?\ prefix. CMD rejects it as a working directory and
// CreateProcess does not accept it reliably either, so it is stripped for both the shell and the
// bounded runner. UNC and device paths are left exactly as they are.
pub(crate) fn working_directory(root: &Path) -> Cow<'_, Path> {
    #[cfg(windows)]
    {
        use std::{
            os::windows::ffi::{OsStrExt, OsStringExt},
            path::{Component, PathBuf, Prefix},
        };
        if matches!(
            root.components().next(),
            Some(Component::Prefix(prefix)) if matches!(prefix.kind(), Prefix::VerbatimDisk(_))
        ) {
            let path: Vec<u16> = root.as_os_str().encode_wide().skip(4).collect();
            return Cow::Owned(PathBuf::from(OsString::from_wide(&path)));
        }
    }
    Cow::Borrowed(root)
}

/// One bounded, timed execution of a program with no shell anywhere in the chain.
pub struct Run<'a> {
    pub program: &'a OsStr,
    pub args: &'a [OsString],
    pub cwd: &'a Path,
    /// `None` removes the variable for this child only; the parent environment is never mutated.
    pub env: &'a [(&'a str, Option<OsString>)],
    pub limit: Duration,
    pub cap: usize,
}

#[derive(Debug)]
pub struct Capture {
    pub code: i32,
    pub stdout: Vec<u8>,
    pub stderr: String,
    pub truncated: bool,
}

// Reading continues past the cap and discards the excess, because a child that blocks writing to a
// full pipe would never exit and would be reported as a timeout instead of as oversized output.
fn drain(mut reader: impl Read + Send + 'static, cap: usize) -> Receiver<(Vec<u8>, bool)> {
    let (sender, receiver) = channel();
    thread::spawn(move || {
        let mut chunk = [0u8; READ_CHUNK];
        let mut buffer = Vec::new();
        let mut truncated = false;
        while let Ok(count) = reader.read(&mut chunk) {
            if count == 0 {
                break;
            }
            let room = cap.saturating_sub(buffer.len());
            if count > room {
                truncated = true;
            }
            buffer.extend_from_slice(&chunk[..count.min(room)]);
        }
        let _ = sender.send((buffer, truncated));
    });
    receiver
}

fn collect(receiver: &Receiver<(Vec<u8>, bool)>) -> (Vec<u8>, bool) {
    // An abandoned reader means output was lost, which is reported as truncation rather than
    // waited on forever.
    receiver
        .recv_timeout(DRAIN_WINDOW)
        .unwrap_or_else(|_| (Vec::new(), true))
}

/// Runs a program with piped stdio, a hard deadline and bounded capture. The program and its
/// arguments are passed as an array, never through a shell, and no console window is created.
/// Only backend services call this; no Tauri command exposes it to the webview.
pub fn run(spec: Run<'_>) -> Result<Capture> {
    let mut command = Command::new(spec.program);
    command
        .args(spec.args)
        .current_dir(working_directory(spec.cwd))
        // A child that asks for input must fail instead of waiting for a terminal that is not there.
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in spec.env {
        match value {
            Some(value) => command.env(key, value),
            None => command.env_remove(key),
        };
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn()?;
    let missing = || ServiceError::new("INTERNAL", "The process pipes were not created.");
    let out = drain(child.stdout.take().ok_or_else(missing)?, spec.cap);
    let errors = drain(child.stderr.take().ok_or_else(missing)?, spec.cap);
    let deadline = Instant::now() + spec.limit;
    let status = loop {
        match child.try_wait()? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ServiceError::new(
                    "TIMED_OUT",
                    "The operation took too long and was stopped.",
                ));
            }
            None => thread::sleep(WAIT_POLL),
        }
    };
    let (stdout, cut) = collect(&out);
    let (mut stderr, trimmed) = collect(&errors);
    Ok(Capture {
        code: status.code().unwrap_or(-1),
        stdout,
        // Git writes diagnostics as UTF-8; the shared decoder keeps a split sequence intact.
        stderr: decode(&mut stderr),
        truncated: cut || trimmed,
    })
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
    fn capture(command: &str, limit: Duration, cap: usize) -> Result<Capture> {
        let program = OsString::from(if cfg!(windows) { "cmd.exe" } else { "/bin/sh" });
        let args = [
            OsString::from(if cfg!(windows) { "/C" } else { "-c" }),
            OsString::from(command),
        ];
        run(Run {
            program: &program,
            args: &args,
            cwd: Path::new("."),
            env: &[],
            limit,
            cap,
        })
    }
    #[test]
    fn captures_separate_streams_and_the_exit_code() {
        let result = capture(
            if cfg!(windows) {
                "echo tbce-out& echo tbce-err 1>&2& exit 3"
            } else {
                "echo tbce-out; echo tbce-err 1>&2; exit 3"
            },
            LIMIT,
            CAPTURE_CAP,
        )
        .unwrap();
        assert_eq!(result.code, 3);
        assert!(
            String::from_utf8_lossy(&result.stdout).contains("tbce-out"),
            "{:?}",
            String::from_utf8_lossy(&result.stdout)
        );
        assert!(result.stderr.contains("tbce-err"), "{}", result.stderr);
        assert!(!result.truncated);
    }
    #[test]
    fn bounded_output_is_truncated_rather_than_unbounded() {
        let result = capture("echo abcdefghijklmnopqrstuvwxyz", LIMIT, 4).unwrap();
        assert!(result.stdout.len() <= 4, "{:?}", result.stdout);
        assert!(result.truncated);
    }
    #[test]
    fn a_child_that_outlives_its_limit_is_stopped() {
        let start = Instant::now();
        let error = capture(
            if cfg!(windows) {
                "ping -n 30 127.0.0.1 >nul"
            } else {
                "sleep 30"
            },
            Duration::from_millis(300),
            CAPTURE_CAP,
        )
        .unwrap_err();
        assert_eq!(error.code, "TIMED_OUT");
        // The deadline is enforced by stopping the child, not by waiting for it to finish.
        assert!(
            start.elapsed() < Duration::from_secs(10),
            "{:?}",
            start.elapsed()
        );
    }
    #[test]
    fn a_missing_program_is_reported_as_not_found() {
        let program = OsString::from("tbce-no-such-program");
        let error = run(Run {
            program: &program,
            args: &[],
            cwd: Path::new("."),
            env: &[],
            limit: LIMIT,
            cap: CAPTURE_CAP,
        })
        .unwrap_err();
        assert_eq!(error.code, "NOT_FOUND");
    }
    #[test]
    fn the_environment_is_changed_only_for_the_child() {
        std::env::set_var("TBCE_PROBE_KEEP", "parent");
        let program = OsString::from(if cfg!(windows) { "cmd.exe" } else { "/bin/sh" });
        let args = [
            OsString::from(if cfg!(windows) { "/C" } else { "-c" }),
            OsString::from(if cfg!(windows) {
                "echo [%TBCE_PROBE_SET%][%TBCE_PROBE_KEEP%]"
            } else {
                "echo [$TBCE_PROBE_SET][$TBCE_PROBE_KEEP]"
            }),
        ];
        let child = run(Run {
            program: &program,
            args: &args,
            cwd: Path::new("."),
            env: &[
                ("TBCE_PROBE_SET", Some(OsString::from("child"))),
                ("TBCE_PROBE_KEEP", None),
            ],
            limit: LIMIT,
            cap: CAPTURE_CAP,
        })
        .unwrap();
        let text = String::from_utf8_lossy(&child.stdout).into_owned();
        assert!(text.contains("[child]"), "{text}");
        assert!(!text.contains("parent"), "{text}");
        // Removing a variable for the child leaves the parent's own environment untouched.
        assert_eq!(std::env::var("TBCE_PROBE_KEEP").unwrap(), "parent");
        std::env::remove_var("TBCE_PROBE_KEEP");
    }
    #[cfg(windows)]
    #[test]
    fn working_directory_converts_only_verbatim_drive_paths() {
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
                working_directory(Path::new(input)).as_os_str(),
                OsStr::new(expected)
            );
        }
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
