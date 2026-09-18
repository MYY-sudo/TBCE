//! A GitHub that is not GitHub, shared by every test in this module: a local socket answering
//! canned responses, so pagination, rate limits, conditional requests, writes and failures are
//! exercised with no network and no token.

use super::{CredentialStore, GitHubService, READ_LIMIT};
use crate::filesystem::Result;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// One canned answer. The mock server hands these out in order, so a test states exactly what
/// GitHub is pretending to do.
#[derive(Clone)]
pub struct Stub {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
    delay: Option<Duration>,
}

impl Stub {
    pub fn ok(body: &str) -> Self {
        Self::code(200, body)
    }

    pub fn code(status: u16, body: &str) -> Self {
        Self {
            status,
            headers: Vec::new(),
            body: body.to_string(),
            delay: None,
        }
    }

    pub fn header(mut self, name: &str, value: impl Into<String>) -> Self {
        self.headers.push((name.to_string(), value.into()));
        self
    }

    pub fn slow(mut self) -> Self {
        self.delay = Some(READ_LIMIT + Duration::from_secs(5));
        self
    }
}

struct Recorded {
    method: String,
    path: String,
    headers: Vec<String>,
    body: String,
}

pub struct Server {
    pub base: String,
    seen: Arc<Mutex<Vec<Recorded>>>,
}

impl Server {
    pub fn requests(&self) -> usize {
        self.seen.lock().unwrap().len()
    }

    pub fn method(&self, index: usize) -> String {
        self.seen.lock().unwrap()[index].method.clone()
    }

    pub fn path(&self, index: usize) -> String {
        self.seen.lock().unwrap()[index].path.clone()
    }

    /// The JSON a request carried, or `Null` when it carried none.
    pub fn json(&self, index: usize) -> serde_json::Value {
        let body = self.seen.lock().unwrap()[index].body.clone();
        serde_json::from_str(&body).unwrap_or(serde_json::Value::Null)
    }

    pub fn sent(&self, index: usize, header: &str) -> Option<String> {
        let needle = format!("{}:", header.to_lowercase());
        self.seen.lock().unwrap()[index]
            .headers
            .iter()
            .find(|line| line.to_lowercase().starts_with(&needle))
            .map(|line| line[needle.len()..].trim().to_string())
    }
}

pub fn serve(stubs: Vec<Stub>) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a local port");
    let base = format!("http://{}", listener.local_addr().unwrap());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&seen);
    std::thread::spawn(move || {
        for (index, stream) in listener.incoming().enumerate() {
            let Ok(mut stream) = stream else { break };
            let mut reader = BufReader::new(stream.try_clone().expect("a cloned socket"));
            let mut start = String::new();
            if reader.read_line(&mut start).unwrap_or(0) == 0 {
                continue;
            }
            let mut parts = start.split_whitespace();
            let method = parts.next().unwrap_or_default().to_string();
            let path = parts.next().unwrap_or_default().to_string();
            let mut headers = Vec::new();
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line.trim().is_empty() {
                    break;
                }
                headers.push(line.trim().to_string());
            }
            let length = headers
                .iter()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            let mut body = vec![0; length];
            let _ = reader.read_exact(&mut body);
            log.lock().unwrap().push(Recorded {
                method,
                path,
                headers,
                body: String::from_utf8_lossy(&body).into_owned(),
            });
            let Some(stub) = stubs.get(index).cloned() else {
                break;
            };
            if let Some(delay) = stub.delay {
                std::thread::sleep(delay);
            }
            let mut answer = format!(
                "HTTP/1.1 {} MOCK\r\nContent-Length: {}\r\nConnection: close\r\n",
                stub.status,
                stub.body.len()
            );
            for (name, value) in &stub.headers {
                answer.push_str(&format!("{name}: {value}\r\n"));
            }
            answer.push_str("\r\n");
            let _ = stream.write_all(answer.as_bytes());
            let _ = stream.write_all(stub.body.as_bytes());
            let _ = stream.flush();
        }
    });
    Server { base, seen }
}

#[derive(Default)]
pub struct Memory(Mutex<Option<String>>);

impl CredentialStore for Arc<Memory> {
    fn read(&self) -> Result<Option<String>> {
        Ok(self.0.lock().unwrap().clone())
    }

    fn write(&self, token: &str) -> Result<()> {
        *self.0.lock().unwrap() = Some(token.to_string());
        Ok(())
    }

    fn clear(&self) -> Result<()> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

pub fn stored(store: &Arc<Memory>) -> Option<String> {
    store.0.lock().unwrap().clone()
}

/// A service already holding a token, so the tests that read data do not restate signing in.
pub fn signed_in(server: &Server) -> (GitHubService, Arc<Memory>) {
    let store = Arc::new(Memory::default());
    store.write("ghp_token").unwrap();
    (
        GitHubService::with(&server.base, Box::new(Arc::clone(&store))),
        store,
    )
}
