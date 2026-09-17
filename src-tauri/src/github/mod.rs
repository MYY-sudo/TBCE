//! Read-only GitHub repository context.
//!
//! The webview never names a host, a path or a header: commands carry a workspace identifier and
//! a page number, and this module builds every request. Repository identity is read from the
//! workspace's own Git remote rather than supplied by the interface, and the access token lives in
//! the operating system credential vault, is read per operation, and is never returned.

use crate::filesystem::{Result, ServiceError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::time::Duration;

const API: &str = "https://api.github.com";
const HOST: &str = "github.com";
const API_VERSION: &str = "2022-11-28";
const ACCEPT: &str = "application/vnd.github+json";
const AGENT: &str = concat!("TBCE/", env!("CARGO_PKG_VERSION"));

const CONNECT_LIMIT: Duration = Duration::from_secs(10);
const READ_LIMIT: Duration = Duration::from_secs(20);
const WRITE_LIMIT: Duration = Duration::from_secs(10);
/// Answers are metadata, not repository contents. The cap is the same one the diff service uses.
const BODY_CAP: usize = 1024 * 1024;
const PER_PAGE: u32 = 30;
const PAGE_MAX: u32 = 1000;
/// Conditional-request cache. Small and cleared wholesale, because it exists to spare the rate
/// limit rather than to be a store.
const CACHE_MAX: usize = 64;

/// The vault entry. The service name is the application identifier and the account is the host, so
/// a later milestone that supports another host does not collide with this one.
const VAULT_SERVICE: &str = "com.tbce.app";
const VAULT_ACCOUNT: &str = "github.com";

/// Where a token may be kept. Only an implementation of this trait ever touches a secret store,
/// which is what keeps the rest of the module free of platform detail and testable without a vault.
pub trait CredentialStore: Send + Sync {
    fn read(&self) -> Result<Option<String>>;
    fn write(&self, token: &str) -> Result<()>;
    fn clear(&self) -> Result<()>;
}

/// The operating system credential vault.
pub struct Vault {
    service: String,
    account: String,
}

impl Vault {
    pub fn new(service: impl Into<String>, account: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            account: account.into(),
        }
    }
}

impl Default for Vault {
    fn default() -> Self {
        Self::new(VAULT_SERVICE, VAULT_ACCOUNT)
    }
}

#[cfg(windows)]
impl Vault {
    fn entry(&self) -> Result<keyring::Entry> {
        keyring::Entry::new(&self.service, &self.account)
            .map_err(|error| ServiceError::new("CREDENTIALS_UNAVAILABLE", error.to_string()))
    }
}

#[cfg(windows)]
impl CredentialStore for Vault {
    fn read(&self) -> Result<Option<String>> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(ServiceError::new(
                "CREDENTIALS_UNAVAILABLE",
                error.to_string(),
            )),
        }
    }

    fn write(&self, token: &str) -> Result<()> {
        self.entry()?
            .set_password(token)
            .map_err(|error| ServiceError::new("CREDENTIALS_UNAVAILABLE", error.to_string()))
    }

    fn clear(&self) -> Result<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(ServiceError::new(
                "CREDENTIALS_UNAVAILABLE",
                error.to_string(),
            )),
        }
    }
}

// Only Windows is a verified target. Rather than write a token somewhere unprotected elsewhere,
// the feature reports that it is unsupported.
#[cfg(not(windows))]
impl CredentialStore for Vault {
    fn read(&self) -> Result<Option<String>> {
        let _ = (&self.service, &self.account);
        Ok(None)
    }

    fn write(&self, _token: &str) -> Result<()> {
        Err(unsupported())
    }

    fn clear(&self) -> Result<()> {
        Err(unsupported())
    }
}

#[cfg(not(windows))]
fn unsupported() -> ServiceError {
    ServiceError::new(
        "CREDENTIALS_UNSUPPORTED",
        "Storing a GitHub token is supported on Windows only in this release.",
    )
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimit {
    pub limit: u64,
    pub remaining: u64,
    /// Unix seconds. Formatting a local time belongs to the interface, not here.
    pub reset: u64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Account {
    SignedOut,
    SignedIn {
        login: String,
        name: Option<String>,
        /// Empty for a fine-grained token: GitHub reports scopes for classic tokens only.
        scopes: Vec<String>,
        rate: Option<RateLimit>,
    },
}

/// What the open folder's Git remote says about GitHub. Every variant is a state the panel can
/// explain; none of them is an error, because a folder that has nothing to do with GitHub is
/// perfectly normal.
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Link {
    NoRepository,
    NoRemote,
    /// The remote points somewhere else. Only github.com is supported in this milestone.
    NotGitHub {
        remote: String,
        host: String,
    },
    Found {
        remote: String,
        owner: String,
        repo: String,
    },
    /// Git itself is missing or failing, mirroring the Git service's own detection.
    Unavailable {
        code: &'static str,
        message: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub default_branch: Option<String>,
    pub private: bool,
    pub fork: bool,
    pub archived: bool,
    pub stars: Option<u64>,
    pub forks: Option<u64>,
    pub watchers: Option<u64>,
    /// GitHub counts issues and pull requests together in this field, so the name says so rather
    /// than implying a separate issue count that would be wrong.
    pub open_issues_and_pull_requests: Option<u64>,
    pub pushed_at: Option<String>,
    pub language: Option<String>,
    pub url: Option<String>,
    pub rate: Option<RateLimit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub oid: String,
    pub protected: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub oid: String,
    pub short: String,
    pub summary: String,
    pub author: Option<String>,
    pub login: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub kind: Option<String>,
    pub reference: Option<String>,
    pub actor: Option<String>,
    pub oid: Option<String>,
    pub timestamp: Option<String>,
}

/// A page and whether GitHub advertised another one. `hasMore` comes from the `Link` header rather
/// than from the length of the page, so a full last page is not mistaken for a partial one.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page<T> {
    pub items: Vec<T>,
    pub page: u32,
    pub has_more: bool,
    pub rate: Option<RateLimit>,
}

#[derive(Deserialize)]
struct UserBody {
    login: String,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct OwnerBody {
    login: String,
}

#[derive(Deserialize)]
struct RepositoryBody {
    name: String,
    full_name: String,
    owner: OwnerBody,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    default_branch: Option<String>,
    #[serde(default)]
    private: bool,
    #[serde(default)]
    fork: bool,
    #[serde(default)]
    archived: bool,
    #[serde(default)]
    stargazers_count: Option<u64>,
    #[serde(default)]
    forks_count: Option<u64>,
    #[serde(default)]
    subscribers_count: Option<u64>,
    #[serde(default)]
    open_issues_count: Option<u64>,
    #[serde(default)]
    pushed_at: Option<String>,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    html_url: Option<String>,
}

#[derive(Deserialize)]
struct BranchBody {
    name: String,
    commit: OidBody,
    #[serde(default)]
    protected: bool,
}

#[derive(Deserialize)]
struct OidBody {
    sha: String,
}

#[derive(Deserialize)]
struct CommitBody {
    sha: String,
    commit: CommitDetail,
    #[serde(default)]
    author: Option<OwnerBody>,
}

#[derive(Deserialize)]
struct CommitDetail {
    #[serde(default)]
    message: String,
    #[serde(default)]
    author: Option<AuthorDetail>,
}

#[derive(Deserialize)]
struct AuthorDetail {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    date: Option<String>,
}

#[derive(Deserialize)]
struct ActivityBody {
    #[serde(default)]
    activity_type: Option<String>,
    #[serde(default, rename = "ref")]
    reference: Option<String>,
    #[serde(default)]
    actor: Option<OwnerBody>,
    #[serde(default)]
    after: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
}

#[derive(Deserialize)]
struct Failure {
    #[serde(default)]
    message: Option<String>,
}

struct Cached {
    etag: String,
    body: Vec<u8>,
    has_more: bool,
}

/// One answer from GitHub, after the status has been accepted.
struct Answer {
    body: Vec<u8>,
    has_more: bool,
    rate: Option<RateLimit>,
}

pub struct GitHubService {
    base: String,
    agent: ureq::Agent,
    store: Box<dyn CredentialStore>,
    cache: HashMap<String, Cached>,
}

impl Default for GitHubService {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for GitHubService {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Deliberately partial: nothing that could carry a secret is formattable.
        formatter
            .debug_struct("GitHubService")
            .field("base", &self.base)
            .finish_non_exhaustive()
    }
}

impl GitHubService {
    /// The production service. The base URL is a constant here and there is no environment
    /// override, so a packaged build cannot be pointed at another host.
    pub fn new() -> Self {
        Self::with(API, Box::new(Vault::default()))
    }

    fn with(base: &str, store: Box<dyn CredentialStore>) -> Self {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(CONNECT_LIMIT)
            .timeout_read(READ_LIMIT)
            .timeout_write(WRITE_LIMIT)
            // A redirect would resend the Authorization header to wherever it points, so none are
            // followed. A moved repository is reported instead.
            .redirects(0)
            .build();
        Self {
            base: base.trim_end_matches('/').to_string(),
            agent,
            store,
            cache: HashMap::new(),
        }
    }

    pub fn account(&mut self) -> Result<Account> {
        let Some(token) = self.store.read()? else {
            return Ok(Account::SignedOut);
        };
        match self.user(&token) {
            Ok(account) => Ok(account),
            // A token GitHub no longer accepts cannot be argued with. It is dropped so the panel
            // offers to connect again instead of repeating a failure the user cannot act on.
            Err(error) if error.code == "GITHUB_AUTH_FAILED" => {
                self.store.clear()?;
                self.cache.clear();
                Ok(Account::SignedOut)
            }
            Err(error) => Err(error),
        }
    }

    /// Stores the token only after GitHub has accepted it, so a typo never replaces a working one.
    pub fn sign_in(&mut self, token: &str) -> Result<Account> {
        let token = token.trim();
        validate_token(token)?;
        self.cache.clear();
        let account = self.user(token)?;
        self.store.write(token)?;
        Ok(account)
    }

    pub fn sign_out(&mut self) -> Result<()> {
        self.cache.clear();
        self.store.clear()
    }

    pub fn repository(&mut self, owner: &str, repo: &str) -> Result<Repository> {
        let path = format!("/repos/{}/{}", segment(owner)?, segment(repo)?);
        let answer = self.get(&path)?;
        let body: RepositoryBody = parse(&answer.body)?;
        Ok(Repository {
            owner: body.owner.login,
            name: body.name,
            full_name: body.full_name,
            description: body.description,
            default_branch: body.default_branch,
            private: body.private,
            fork: body.fork,
            archived: body.archived,
            stars: body.stargazers_count,
            forks: body.forks_count,
            watchers: body.subscribers_count,
            open_issues_and_pull_requests: body.open_issues_count,
            pushed_at: body.pushed_at,
            language: body.language,
            url: body.html_url,
            rate: answer.rate,
        })
    }

    pub fn branches(&mut self, owner: &str, repo: &str, page: u32) -> Result<Page<Branch>> {
        let page = clamp(page);
        let path = format!(
            "/repos/{}/{}/branches?per_page={PER_PAGE}&page={page}",
            segment(owner)?,
            segment(repo)?
        );
        let answer = self.get(&path)?;
        let bodies: Vec<BranchBody> = parse(&answer.body)?;
        Ok(Page {
            items: bodies
                .into_iter()
                .map(|body| Branch {
                    name: body.name,
                    oid: body.commit.sha,
                    protected: body.protected,
                })
                .collect(),
            page,
            has_more: answer.has_more,
            rate: answer.rate,
        })
    }

    pub fn commits(
        &mut self,
        owner: &str,
        repo: &str,
        reference: Option<&str>,
        page: u32,
    ) -> Result<Page<Commit>> {
        let page = clamp(page);
        let mut path = format!(
            "/repos/{}/{}/commits?per_page={PER_PAGE}&page={page}",
            segment(owner)?,
            segment(repo)?
        );
        if let Some(reference) = reference.map(str::trim).filter(|value| !value.is_empty()) {
            validate_reference(reference)?;
            path.push_str("&sha=");
            path.push_str(reference);
        }
        let answer = match self.get(&path) {
            Ok(answer) => answer,
            Err(error) if error.code == "GITHUB_EMPTY_REPOSITORY" => {
                return Ok(Page {
                    items: Vec::new(),
                    page,
                    has_more: false,
                    rate: None,
                });
            }
            Err(error) => return Err(error),
        };
        let bodies: Vec<CommitBody> = parse(&answer.body)?;
        Ok(Page {
            items: bodies
                .into_iter()
                .map(|body| {
                    let short = body.sha.chars().take(7).collect();
                    let author = body.commit.author.as_ref();
                    Commit {
                        oid: body.sha,
                        short,
                        summary: body
                            .commit
                            .message
                            .lines()
                            .next()
                            .unwrap_or_default()
                            .to_string(),
                        author: author.and_then(|detail| detail.name.clone()),
                        login: body.author.map(|owner| owner.login),
                        date: author.and_then(|detail| detail.date.clone()),
                    }
                })
                .collect(),
            page,
            has_more: answer.has_more,
            rate: answer.rate,
        })
    }

    pub fn activity(&mut self, owner: &str, repo: &str, page: u32) -> Result<Page<Activity>> {
        let page = clamp(page);
        let path = format!(
            "/repos/{}/{}/activity?per_page={PER_PAGE}&page={page}",
            segment(owner)?,
            segment(repo)?
        );
        let answer = self.get(&path)?;
        let bodies: Vec<ActivityBody> = parse(&answer.body)?;
        Ok(Page {
            items: bodies
                .into_iter()
                .map(|body| Activity {
                    kind: body.activity_type,
                    reference: body.reference,
                    actor: body.actor.map(|owner| owner.login),
                    oid: body.after,
                    timestamp: body.timestamp,
                })
                .collect(),
            page,
            has_more: answer.has_more,
            rate: answer.rate,
        })
    }

    fn user(&mut self, token: &str) -> Result<Account> {
        // Scopes arrive in a header, so this one request is made without the conditional cache.
        let answer = self.send("/user", token, None)?;
        let scopes = answer.scopes.clone();
        let body: UserBody = parse(&answer.answer.body)?;
        Ok(Account::SignedIn {
            login: body.login,
            name: body.name.filter(|name| !name.is_empty()),
            scopes,
            rate: answer.answer.rate,
        })
    }

    fn token(&self) -> Result<String> {
        self.store.read()?.ok_or_else(|| {
            ServiceError::new(
                "GITHUB_SIGNED_OUT",
                "Connect a GitHub account to read repository context.",
            )
        })
    }

    /// Every read goes through here: one place holds the headers, the deadlines, the body cap, the
    /// conditional cache and the status classification.
    fn get(&mut self, path: &str) -> Result<Answer> {
        let token = self.token()?;
        let etag = self.cache.get(path).map(|cached| cached.etag.clone());
        let sent = match self.send(path, &token, etag.as_deref()) {
            Err(error) if error.code == "GITHUB_AUTH_FAILED" => {
                self.cache.clear();
                if let Err(clear_error) = self.store.clear() {
                    return Err(ServiceError::new(
                        "GITHUB_AUTH_FAILED",
                        format!(
                            "{} The rejected credential could not be removed: {}",
                            error.message,
                            scrub(&clear_error.message, &token)
                        ),
                    ));
                }
                return Err(error);
            }
            result => result?,
        };
        if sent.not_modified {
            let cached = self.cache.get(path).ok_or_else(invalid)?;
            return Ok(Answer {
                body: cached.body.clone(),
                has_more: cached.has_more,
                rate: sent.answer.rate,
            });
        }
        if let Some(etag) = sent.etag {
            self.remember(path, etag, &sent.answer);
        }
        Ok(sent.answer)
    }

    fn remember(&mut self, path: &str, etag: String, answer: &Answer) {
        if self.cache.len() >= CACHE_MAX {
            self.cache.clear();
        }
        self.cache.insert(
            path.to_string(),
            Cached {
                etag,
                body: answer.body.clone(),
                has_more: answer.has_more,
            },
        );
    }

    fn send(&self, path: &str, token: &str, etag: Option<&str>) -> Result<Sent> {
        let url = format!("{}{}", self.base, path);
        let mut request = self
            .agent
            .get(&url)
            .set("Accept", ACCEPT)
            .set("X-GitHub-Api-Version", API_VERSION)
            .set("User-Agent", AGENT)
            .set("Authorization", &format!("Bearer {token}"));
        if let Some(etag) = etag {
            request = request.set("If-None-Match", etag);
        }
        let response = match request.call() {
            Ok(response) => response,
            Err(ureq::Error::Status(_, response)) => response,
            Err(ureq::Error::Transport(transport)) => return Err(network(&transport, token)),
        };
        // Headers must be read before the body, which consumes the response.
        let status = response.status();
        let rate = rate_of(&response);
        let has_more = advertises_next(&response);
        let etag = response.header("etag").map(str::to_string);
        let retry_after = response.header("retry-after").is_some();
        if status == 304 {
            return Ok(Sent {
                answer: Answer {
                    body: Vec::new(),
                    has_more,
                    rate,
                },
                etag,
                scopes: Vec::new(),
                not_modified: true,
            });
        }
        let scopes = response
            .header("x-oauth-scopes")
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|scope| !scope.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        let body = read_body(response, token)?;
        if status == 200 {
            return Ok(Sent {
                answer: Answer {
                    body,
                    has_more,
                    rate,
                },
                etag,
                scopes,
                not_modified: false,
            });
        }
        Err(classify(status, &body, rate, retry_after, token))
    }
}

struct Sent {
    answer: Answer,
    etag: Option<String>,
    scopes: Vec<String>,
    not_modified: bool,
}

fn clamp(page: u32) -> u32 {
    page.clamp(1, PAGE_MAX)
}

fn invalid() -> ServiceError {
    ServiceError::new(
        "GITHUB_RESPONSE_INVALID",
        "GitHub returned an answer TBCE could not read.",
    )
}

/// Replaces the token anywhere it might appear in text that can reach the interface. GitHub does
/// not echo credentials, so this guards against a future answer that does.
fn scrub(text: &str, token: &str) -> String {
    if token.is_empty() {
        return text.to_string();
    }
    text.replace(token, "***")
}

fn network(transport: &ureq::Transport, token: &str) -> ServiceError {
    let message = scrub(&transport.to_string(), token);
    let timed_out = message.to_lowercase().contains("timed out")
        || matches!(transport.kind(), ureq::ErrorKind::Io)
            && message.to_lowercase().contains("time");
    if timed_out {
        return ServiceError::new(
            "GITHUB_TIMED_OUT",
            "GitHub did not answer in time. Check your connection and try again.",
        );
    }
    ServiceError::new(
        "GITHUB_NETWORK_FAILED",
        format!("TBCE could not reach GitHub: {message}"),
    )
}

fn read_body(response: ureq::Response, token: &str) -> Result<Vec<u8>> {
    let mut body = Vec::new();
    response
        .into_reader()
        // Reading one byte past the cap is what distinguishes "exactly full" from "too large".
        .take(BODY_CAP as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|error| {
            ServiceError::new(
                "GITHUB_NETWORK_FAILED",
                format!(
                    "TBCE could not read GitHub's answer: {}",
                    scrub(&error.to_string(), token)
                ),
            )
        })?;
    if body.len() > BODY_CAP {
        return Err(ServiceError::new(
            "GITHUB_RESPONSE_INVALID",
            "GitHub returned more data than TBCE will read.",
        ));
    }
    Ok(body)
}

fn parse<T: for<'de> Deserialize<'de>>(body: &[u8]) -> Result<T> {
    serde_json::from_slice(body).map_err(|_| invalid())
}

fn rate_of(response: &ureq::Response) -> Option<RateLimit> {
    let number = |name: &str| -> Option<u64> { response.header(name)?.trim().parse().ok() };
    Some(RateLimit {
        limit: number("x-ratelimit-limit")?,
        remaining: number("x-ratelimit-remaining")?,
        reset: number("x-ratelimit-reset")?,
    })
}

fn advertises_next(response: &ureq::Response) -> bool {
    response.header("link").is_some_and(|link| {
        link.split(',')
            .any(|part| part.contains("rel=\"next\"") || part.contains("rel=next"))
    })
}

fn classify(
    status: u16,
    body: &[u8],
    rate: Option<RateLimit>,
    retry_after: bool,
    token: &str,
) -> ServiceError {
    let reported = serde_json::from_slice::<Failure>(body)
        .ok()
        .and_then(|failure| failure.message)
        .map(|message| scrub(&message, token))
        .filter(|message| !message.is_empty());
    let exhausted = retry_after || rate.is_some_and(|rate| rate.remaining == 0);
    let detail = |fallback: &str| reported.clone().unwrap_or_else(|| fallback.to_string());
    match status {
        401 => ServiceError::new(
            "GITHUB_AUTH_FAILED",
            "GitHub rejected the stored token. Connect the account again.",
        ),
        403 | 429 if exhausted || status == 429 => ServiceError::new(
            "GITHUB_RATE_LIMITED",
            match rate {
                Some(rate) => format!(
                    "GitHub's rate limit is used up. It resets at {} in Unix seconds.",
                    rate.reset
                ),
                None => "GitHub's rate limit is used up. Try again later.".to_string(),
            },
        ),
        403 => ServiceError::new(
            "GITHUB_FORBIDDEN",
            detail("GitHub refused this request for this token."),
        ),
        409 if reported.as_deref() == Some("Git Repository is empty.") => ServiceError::new(
            "GITHUB_EMPTY_REPOSITORY",
            "This GitHub repository has no commits yet.",
        ),
        404 => ServiceError::new(
            "GITHUB_NOT_FOUND",
            "GitHub has no repository there, or this token cannot see it.",
        ),
        // Redirects are never followed, so a moved repository arrives here rather than silently
        // resending the token to wherever it points.
        301 | 302 | 307 | 308 => ServiceError::new(
            "GITHUB_NOT_FOUND",
            "This repository has moved. Update the remote and try again.",
        ),
        500..=599 => ServiceError::new(
            "GITHUB_UNAVAILABLE",
            detail("GitHub is not answering correctly right now."),
        ),
        other => ServiceError::new(
            "GITHUB_UNAVAILABLE",
            format!("GitHub answered with status {other}. {}", detail(""))
                .trim_end()
                .to_string(),
        ),
    }
}

/// A token travels in a header, so a control character would corrupt the request rather than
/// simply fail it. The shape is checked before anything is sent or stored.
fn validate_token(token: &str) -> Result<()> {
    let rejected = |reason: &str| {
        Err(ServiceError::new(
            "GITHUB_TOKEN_REJECTED",
            format!("This does not look like a GitHub token: {reason}"),
        ))
    };
    if token.is_empty() {
        return rejected("it is empty.");
    }
    if token.len() > 512 {
        return rejected("it is too long.");
    }
    if !token
        .chars()
        .all(|character| character.is_ascii_graphic() && character != ':')
    {
        return rejected("it contains characters a token cannot contain.");
    }
    Ok(())
}

/// Owner and repository names come from a Git remote, so they are checked before they are put in a
/// request path. A crafted remote must not be able to reach another endpoint.
fn segment(value: &str) -> Result<&str> {
    let allowed =
        |character: char| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.');
    if value.is_empty()
        || value.len() > 100
        || !value.chars().all(allowed)
        || value.starts_with('.')
    {
        return Err(ServiceError::new(
            "GITHUB_NOT_LINKED",
            "This repository's GitHub remote could not be read.",
        ));
    }
    Ok(value)
}

fn validate_reference(reference: &str) -> Result<()> {
    let allowed = |character: char| {
        character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/')
    };
    if reference.len() > 255 || !reference.chars().all(allowed) || reference.contains("..") {
        return Err(ServiceError::new(
            "INVALID_REF",
            "That branch or commit name cannot be used.",
        ));
    }
    Ok(())
}

/// The host, owner and repository a remote URL points at, or nothing when it is not a URL this
/// milestone understands. Userinfo is dropped rather than parsed: a token in a remote URL is the
/// user's own business and must not travel any further.
fn parse_remote(url: &str) -> Option<(String, String, String)> {
    let url = url.trim();
    let rest = match url.split_once("://") {
        Some((scheme, rest)) if !scheme.is_empty() => rest,
        // scp-style, which always carries a user: git@github.com:owner/repo.git
        _ => {
            let (_, rest) = url.split_once('@')?;
            let (host, path) = rest.split_once(':')?;
            return finish(host, path);
        }
    };
    let rest = match rest.split_once('@') {
        Some((_, rest)) => rest,
        None => rest,
    };
    let (authority, path) = rest.split_once('/')?;
    let host = authority.split(':').next()?;
    finish(host, path)
}

fn finish(host: &str, path: &str) -> Option<(String, String, String)> {
    if host.is_empty() {
        return None;
    }
    let path = path.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, repo) = path.split_once('/')?;
    if owner.is_empty() || repo.is_empty() || repo.contains('/') {
        return None;
    }
    Some((
        host.to_ascii_lowercase(),
        owner.to_string(),
        repo.to_string(),
    ))
}

fn github_host(host: &str) -> bool {
    host == HOST || host == "www.github.com"
}

/// What the open folder says about GitHub. Runs Git and no network at all, so opening the panel
/// never waits on a request to decide whether there is anything to request.
pub fn link(root: &Path) -> Link {
    let service = match crate::git::GitService::open(root) {
        Ok(service) => service,
        Err(error) => {
            return match error.code {
                "NOT_A_REPOSITORY" | "REPOSITORY_NOT_ROOT" | "BARE_REPOSITORY" => {
                    Link::NoRepository
                }
                code => Link::Unavailable {
                    code,
                    message: error.message,
                },
            }
        }
    };
    let named = match service.remote_url() {
        Ok(Some(named)) => named,
        Ok(None) => return Link::NoRemote,
        Err(error) => {
            return Link::Unavailable {
                code: error.code,
                message: error.message,
            }
        }
    };
    let (remote, url) = named;
    match parse_remote(&url) {
        Some((host, owner, repo)) if github_host(&host) => Link::Found {
            remote,
            owner,
            repo,
        },
        Some((host, _, _)) => Link::NotGitHub { remote, host },
        None => Link::NotGitHub {
            remote,
            host: String::new(),
        },
    }
}

/// The owner and repository the commands operate on, or a refusal the panel can explain.
pub fn linked(root: &Path) -> Result<(String, String)> {
    match link(root) {
        Link::Found { owner, repo, .. } => Ok((owner, repo)),
        Link::Unavailable { code, message } => Err(ServiceError::new(code, message)),
        _ => Err(ServiceError::new(
            "GITHUB_NOT_LINKED",
            "This folder has no GitHub remote to read.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    /// One canned answer. The mock server hands these out in order, so a test states exactly what
    /// GitHub is pretending to do.
    #[derive(Clone)]
    struct Stub {
        status: u16,
        headers: Vec<(String, String)>,
        body: String,
        delay: Option<Duration>,
    }

    impl Stub {
        fn ok(body: &str) -> Self {
            Self {
                status: 200,
                headers: Vec::new(),
                body: body.to_string(),
                delay: None,
            }
        }

        fn code(status: u16, body: &str) -> Self {
            Self {
                status,
                headers: Vec::new(),
                body: body.to_string(),
                delay: None,
            }
        }

        fn header(mut self, name: &str, value: impl Into<String>) -> Self {
            self.headers.push((name.to_string(), value.into()));
            self
        }

        fn slow(mut self) -> Self {
            self.delay = Some(READ_LIMIT + Duration::from_secs(5));
            self
        }
    }

    struct Recorded {
        path: String,
        headers: Vec<String>,
    }

    struct Server {
        base: String,
        seen: Arc<Mutex<Vec<Recorded>>>,
    }

    impl Server {
        fn requests(&self) -> usize {
            self.seen.lock().unwrap().len()
        }

        fn path(&self, index: usize) -> String {
            self.seen.lock().unwrap()[index].path.clone()
        }

        fn sent(&self, index: usize, header: &str) -> Option<String> {
            let needle = format!("{}:", header.to_lowercase());
            self.seen.lock().unwrap()[index]
                .headers
                .iter()
                .find(|line| line.to_lowercase().starts_with(&needle))
                .map(|line| line[needle.len()..].trim().to_string())
        }
    }

    /// A GitHub that is not GitHub: a local socket answering canned responses, so pagination, rate
    /// limits, conditional requests and failures are exercised with no network and no token.
    fn serve(stubs: Vec<Stub>) -> Server {
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
                let path = start
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or_default()
                    .to_string();
                let mut headers = Vec::new();
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line.trim().is_empty() {
                        break;
                    }
                    headers.push(line.trim().to_string());
                }
                log.lock().unwrap().push(Recorded { path, headers });
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
    struct Memory(Mutex<Option<String>>);

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

    fn stored(store: &Arc<Memory>) -> Option<String> {
        store.0.lock().unwrap().clone()
    }

    /// A service already holding a token, so the tests that read data do not restate signing in.
    fn signed_in(server: &Server) -> (GitHubService, Arc<Memory>) {
        let store = Arc::new(Memory::default());
        store.write("ghp_token").unwrap();
        (
            GitHubService::with(&server.base, Box::new(Arc::clone(&store))),
            store,
        )
    }

    const USER: &str = r#"{"login":"octocat","name":"Öykü Çelik"}"#;
    const REPO: &str = r#"{"name":"TBCE","full_name":"MYY-sudo/TBCE","owner":{"login":"MYY-sudo"},
        "description":"Tools, Branches, Code, Everything","default_branch":"main","private":false,
        "open_issues_count":7,"stargazers_count":3,"language":"Rust"}"#;

    #[test]
    fn a_token_is_stored_only_after_github_accepts_it() {
        let server = serve(vec![Stub::ok(USER)]);
        let store = Arc::new(Memory::default());
        let mut service = GitHubService::with(&server.base, Box::new(Arc::clone(&store)));

        let account = service.sign_in(" ghp_token ").unwrap();

        assert!(matches!(account, Account::SignedIn { ref login, .. } if login == "octocat"));
        assert_eq!(stored(&store).as_deref(), Some("ghp_token"));
        assert_eq!(
            server.sent(0, "authorization").as_deref(),
            Some("Bearer ghp_token")
        );
        assert_eq!(
            server.sent(0, "x-github-api-version").as_deref(),
            Some(API_VERSION)
        );
        assert_eq!(server.sent(0, "accept").as_deref(), Some(ACCEPT));
    }

    #[test]
    fn a_rejected_token_leaves_an_existing_one_untouched() {
        let server = serve(vec![Stub::code(401, r#"{"message":"Bad credentials"}"#)]);
        let store = Arc::new(Memory::default());
        store.write("ghp_working").unwrap();
        let mut service = GitHubService::with(&server.base, Box::new(Arc::clone(&store)));

        let failure = service.sign_in("ghp_typo").unwrap_err();

        assert_eq!(failure.code, "GITHUB_AUTH_FAILED");
        assert_eq!(stored(&store).as_deref(), Some("ghp_working"));
    }

    #[test]
    fn a_malformed_token_is_refused_before_anything_is_sent() {
        let server = serve(vec![Stub::ok(USER)]);
        let store = Arc::new(Memory::default());
        let mut service = GitHubService::with(&server.base, Box::new(Arc::clone(&store)));

        for candidate in ["", "   ", "ghp bad", "ghp\nbad", "ghp:bad"] {
            let failure = service.sign_in(candidate).unwrap_err();
            assert_eq!(
                failure.code, "GITHUB_TOKEN_REJECTED",
                "accepted {candidate:?}"
            );
        }
        assert_eq!(
            server.requests(),
            0,
            "a refused token still reached the network"
        );
        assert_eq!(stored(&store), None);
    }

    #[test]
    fn signing_out_removes_the_credential() {
        let server = serve(vec![]);
        let (mut service, store) = signed_in(&server);

        service.sign_out().unwrap();

        assert_eq!(stored(&store), None);
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn a_signed_out_service_reads_nothing_and_asks_nothing() {
        let server = serve(vec![Stub::ok(REPO)]);
        let store = Arc::new(Memory::default());
        let mut service = GitHubService::with(&server.base, Box::new(Arc::clone(&store)));

        assert!(matches!(service.account().unwrap(), Account::SignedOut));
        let failure = service.repository("MYY-sudo", "TBCE").unwrap_err();

        assert_eq!(failure.code, "GITHUB_SIGNED_OUT");
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn a_revoked_token_is_dropped_and_reported_as_signed_out() {
        let server = serve(vec![Stub::code(401, r#"{"message":"Bad credentials"}"#)]);
        let (mut service, store) = signed_in(&server);

        assert!(matches!(service.account().unwrap(), Account::SignedOut));
        assert_eq!(stored(&store), None);
    }

    #[test]
    fn a_revoked_token_during_any_repository_read_clears_credentials_and_cache() {
        for operation in ["repository", "branches", "commits", "activity"] {
            let server = serve(vec![
                Stub::ok(REPO).header("ETag", "cached"),
                Stub::code(401, r#"{"message":"Bad credentials"}"#),
            ]);
            let (mut service, store) = signed_in(&server);
            service.repository("owner", "repo").unwrap();
            assert!(!service.cache.is_empty());
            let failure = match operation {
                "repository" => service.repository("owner", "repo").unwrap_err(),
                "branches" => service.branches("owner", "repo", 1).unwrap_err(),
                "commits" => service.commits("owner", "repo", None, 1).unwrap_err(),
                _ => service.activity("owner", "repo", 1).unwrap_err(),
            };
            assert_eq!(failure.code, "GITHUB_AUTH_FAILED");
            assert_eq!(stored(&store), None);
            assert!(service.cache.is_empty());
            assert!(matches!(service.account().unwrap(), Account::SignedOut));
            assert_eq!(
                service.repository("owner", "repo").unwrap_err().code,
                "GITHUB_SIGNED_OUT"
            );
            assert_eq!(server.requests(), 2);
        }
    }

    #[test]
    fn only_the_specific_empty_repository_conflict_becomes_an_empty_commits_page() {
        let server = serve(vec![
            Stub::code(409, r#"{"message":"Git Repository is empty."}"#),
            Stub::code(409, r#"{"message":"Another conflict"}"#),
            Stub::code(409, "not json"),
            Stub::code(500, r#"{"message":"Git Repository is empty."}"#),
        ]);
        let (mut service, _) = signed_in(&server);
        let page = service.commits("owner", "repo", None, 2).unwrap();
        assert!(page.items.is_empty());
        assert!(!page.has_more);
        assert_eq!(page.page, 2);
        for _ in 0..3 {
            assert_eq!(
                service.commits("owner", "repo", None, 1).unwrap_err().code,
                "GITHUB_UNAVAILABLE"
            );
        }
    }

    #[test]
    fn watchers_use_subscribers_and_do_not_fall_back_to_stars() {
        let repo: serde_json::Value = serde_json::from_str(REPO).unwrap();
        let mut counted = repo.clone();
        counted["watchers_count"] = 30.into();
        counted["stargazers_count"] = 30.into();
        counted["subscribers_count"] = 4.into();
        let server = serve(vec![
            Stub::ok(&counted.to_string()),
            Stub::ok(&repo.to_string()),
        ]);
        let (mut service, _) = signed_in(&server);
        let repository = service.repository("owner", "repo").unwrap();
        assert_eq!(repository.stars, Some(30));
        assert_eq!(repository.watchers, Some(4));
        assert_eq!(service.repository("owner", "repo").unwrap().watchers, None);
    }

    #[test]
    fn classic_token_scopes_are_reported_and_a_fine_grained_token_reports_none() {
        let server = serve(vec![
            Stub::ok(USER).header("X-OAuth-Scopes", "repo, read:org"),
            Stub::ok(USER),
        ]);
        let (mut service, _) = signed_in(&server);

        let classic = service.account().unwrap();
        let fine = service.account().unwrap();

        match classic {
            Account::SignedIn { scopes, .. } => assert_eq!(scopes, vec!["repo", "read:org"]),
            other => panic!("expected a signed-in account, found {other:?}"),
        }
        match fine {
            Account::SignedIn { scopes, .. } => assert!(scopes.is_empty()),
            other => panic!("expected a signed-in account, found {other:?}"),
        }
    }

    #[test]
    fn repository_fields_and_the_rate_limit_survive_the_round_trip() {
        let server = serve(vec![Stub::ok(REPO)
            .header("X-RateLimit-Limit", "5000")
            .header("X-RateLimit-Remaining", "4987")
            .header("X-RateLimit-Reset", "1789000000")]);
        let (mut service, _) = signed_in(&server);

        let repository = service.repository("MYY-sudo", "TBCE").unwrap();

        assert_eq!(repository.owner, "MYY-sudo");
        assert_eq!(repository.full_name, "MYY-sudo/TBCE");
        assert_eq!(repository.default_branch.as_deref(), Some("main"));
        assert_eq!(repository.open_issues_and_pull_requests, Some(7));
        assert!(!repository.private);
        let rate = repository.rate.expect("a reported rate limit");
        assert_eq!(
            (rate.limit, rate.remaining, rate.reset),
            (5000, 4987, 1789000000)
        );
        assert_eq!(server.path(0), "/repos/MYY-sudo/TBCE");
    }

    #[test]
    fn unicode_survives_names_and_commit_messages() {
        let commits = r#"[{"sha":"1111111111111111111111111111111111111111",
            "commit":{"message":"özellik: ğüşıöç ekle 🎉\n\nbody","author":{"name":"Öykü Çelik","date":"2026-09-17T10:00:00Z"}},
            "author":{"login":"oyku"}}]"#;
        let server = serve(vec![Stub::ok(commits)]);
        let (mut service, _) = signed_in(&server);

        let page = service.commits("MYY-sudo", "TBCE", None, 1).unwrap();

        let commit = &page.items[0];
        assert_eq!(commit.summary, "özellik: ğüşıöç ekle 🎉");
        assert_eq!(commit.author.as_deref(), Some("Öykü Çelik"));
        assert_eq!(commit.login.as_deref(), Some("oyku"));
        assert_eq!(commit.short, "1111111");
    }

    #[test]
    fn another_page_is_advertised_by_the_link_header_not_by_the_page_size() {
        let full: Vec<String> = (0..PER_PAGE)
            .map(|index| format!(r#"{{"name":"branch-{index}","commit":{{"sha":"{index:040}"}}}}"#))
            .collect();
        let body = format!("[{}]", full.join(","));
        let server = serve(vec![
            Stub::ok(&body).header(
                "Link",
                "<http://example.invalid/x?page=2>; rel=\"next\", <http://example.invalid/x?page=9>; rel=\"last\"",
            ),
            Stub::ok(&body),
        ]);
        let (mut service, _) = signed_in(&server);

        let first = service.branches("MYY-sudo", "TBCE", 1).unwrap();
        let second = service.branches("MYY-sudo", "TBCE", 2).unwrap();

        assert!(first.has_more, "a Link header advertising next was ignored");
        assert!(
            !second.has_more,
            "a full page without a Link header was treated as having more"
        );
        assert_eq!(second.page, 2);
        assert!(server.path(1).contains("page=2"));
        assert!(server.path(1).contains(&format!("per_page={PER_PAGE}")));
    }

    #[test]
    fn a_page_number_is_clamped_rather_than_trusted() {
        let server = serve(vec![Stub::ok("[]"), Stub::ok("[]")]);
        let (mut service, _) = signed_in(&server);

        service.branches("MYY-sudo", "TBCE", 0).unwrap();
        service.branches("MYY-sudo", "TBCE", u32::MAX).unwrap();

        assert!(server.path(0).contains("page=1"));
        assert!(server.path(1).contains(&format!("page={PAGE_MAX}")));
    }

    #[test]
    fn an_unchanged_answer_is_reused_without_being_resent() {
        let server = serve(vec![
            Stub::ok(REPO).header("ETag", "\"abc\""),
            Stub::code(304, "").header("ETag", "\"abc\""),
        ]);
        let (mut service, _) = signed_in(&server);

        let first = service.repository("MYY-sudo", "TBCE").unwrap();
        let second = service.repository("MYY-sudo", "TBCE").unwrap();

        assert_eq!(first.full_name, second.full_name);
        assert_eq!(
            server.sent(1, "if-none-match").as_deref(),
            Some("\"abc\""),
            "the second request did not carry the stored ETag"
        );
    }

    #[test]
    fn an_exhausted_rate_limit_reports_when_it_resets() {
        let server = serve(vec![Stub::code(
            403,
            r#"{"message":"API rate limit exceeded"}"#,
        )
        .header("X-RateLimit-Limit", "5000")
        .header("X-RateLimit-Remaining", "0")
        .header("X-RateLimit-Reset", "1789000000")]);
        let (mut service, _) = signed_in(&server);

        let failure = service.repository("MYY-sudo", "TBCE").unwrap_err();

        assert_eq!(failure.code, "GITHUB_RATE_LIMITED");
        assert!(
            failure.message.contains("1789000000"),
            "the reset time was not reported: {}",
            failure.message
        );
    }

    #[test]
    fn a_refusal_that_is_not_a_rate_limit_stays_a_refusal() {
        let server = serve(vec![Stub::code(
            403,
            r#"{"message":"Resource protected by SAML"}"#,
        )
        .header("X-RateLimit-Limit", "5000")
        .header("X-RateLimit-Remaining", "4999")
        .header("X-RateLimit-Reset", "1789000000")]);
        let (mut service, _) = signed_in(&server);

        let failure = service.repository("MYY-sudo", "TBCE").unwrap_err();

        assert_eq!(failure.code, "GITHUB_FORBIDDEN");
        assert!(failure.message.contains("SAML"));
    }

    #[test]
    fn each_failing_status_maps_to_its_own_code() {
        for (status, code) in [
            (429, "GITHUB_RATE_LIMITED"),
            (404, "GITHUB_NOT_FOUND"),
            (301, "GITHUB_NOT_FOUND"),
            (500, "GITHUB_UNAVAILABLE"),
            (502, "GITHUB_UNAVAILABLE"),
            (418, "GITHUB_UNAVAILABLE"),
        ] {
            let server = serve(vec![Stub::code(status, r#"{"message":"nope"}"#)]);
            let (mut service, _) = signed_in(&server);

            let failure = service.repository("MYY-sudo", "TBCE").unwrap_err();

            assert_eq!(failure.code, code, "status {status} was misclassified");
        }
    }

    #[test]
    fn a_malformed_or_oversized_answer_is_refused_rather_than_trusted() {
        let server = serve(vec![Stub::ok("{not json")]);
        let (mut service, _) = signed_in(&server);
        assert_eq!(
            service.repository("MYY-sudo", "TBCE").unwrap_err().code,
            "GITHUB_RESPONSE_INVALID"
        );

        let oversized = "x".repeat(BODY_CAP + 1);
        let server = serve(vec![Stub::ok(&oversized)]);
        let (mut service, _) = signed_in(&server);
        assert_eq!(
            service.repository("MYY-sudo", "TBCE").unwrap_err().code,
            "GITHUB_RESPONSE_INVALID"
        );
    }

    #[test]
    fn an_answer_that_never_arrives_is_reported_as_a_timeout() {
        let server = serve(vec![Stub::ok(REPO).slow()]);
        let (mut service, _) = signed_in(&server);

        let failure = service.repository("MYY-sudo", "TBCE").unwrap_err();

        assert_eq!(
            failure.code, "GITHUB_TIMED_OUT",
            "a stalled answer was classified as {}: {}",
            failure.code, failure.message
        );
    }

    #[test]
    fn a_token_never_reaches_a_message() {
        // GitHub does not echo credentials. If a future answer did, the message must not carry it.
        let server = serve(vec![Stub::code(
            403,
            r#"{"message":"token ghp_token is not allowed"}"#,
        )]);
        let (mut service, _) = signed_in(&server);

        let failure = service.repository("MYY-sudo", "TBCE").unwrap_err();

        assert!(
            !failure.message.contains("ghp_token"),
            "the token reached a message: {}",
            failure.message
        );
        assert!(failure.message.contains("***"));
    }

    #[test]
    fn nothing_in_this_module_prints() {
        let source = include_str!("mod.rs");
        let code = source
            .split("#[cfg(test)]")
            .next()
            .expect("the non-test source");
        for forbidden in ["println!", "eprintln!", "dbg!", "print!"] {
            assert!(
                !code.contains(forbidden),
                "{forbidden} must never appear where a token could be formatted"
            );
        }
    }

    #[test]
    fn the_production_service_talks_only_to_github_over_https() {
        let service = GitHubService::new();
        assert_eq!(service.base, API);
        assert!(service.base.starts_with("https://"));
    }

    #[test]
    fn a_crafted_remote_cannot_reach_another_endpoint() {
        let server = serve(vec![Stub::ok(REPO)]);
        let (mut service, _) = signed_in(&server);

        for (owner, repo) in [
            ("..", "TBCE"),
            ("MYY-sudo", "../../user"),
            ("MYY-sudo", "TBCE?x=1"),
            ("MYY sudo", "TBCE"),
            ("", "TBCE"),
        ] {
            let failure = service.repository(owner, repo).unwrap_err();
            assert_eq!(failure.code, "GITHUB_NOT_LINKED", "accepted {owner}/{repo}");
        }
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn a_crafted_reference_is_refused() {
        let server = serve(vec![Stub::ok("[]")]);
        let (mut service, _) = signed_in(&server);

        let failure = service
            .commits("MYY-sudo", "TBCE", Some("main&per_page=100"), 1)
            .unwrap_err();

        assert_eq!(failure.code, "INVALID_REF");
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn every_remote_form_github_uses_is_recognized() {
        for url in [
            "https://github.com/MYY-sudo/TBCE.git",
            "https://github.com/MYY-sudo/TBCE",
            "https://github.com/MYY-sudo/TBCE/",
            "https://token:x-oauth-basic@github.com/MYY-sudo/TBCE.git",
            "https://WWW.GitHub.com/MYY-sudo/TBCE.git",
            "ssh://git@github.com/MYY-sudo/TBCE.git",
            "ssh://git@github.com:22/MYY-sudo/TBCE.git",
            "git@github.com:MYY-sudo/TBCE.git",
            "git://github.com/MYY-sudo/TBCE.git",
        ] {
            let (host, owner, repo) = parse_remote(url).unwrap_or_else(|| panic!("{url}"));
            assert!(github_host(&host), "{url} was not read as GitHub");
            assert_eq!(
                (owner.as_str(), repo.as_str()),
                ("MYY-sudo", "TBCE"),
                "{url}"
            );
        }
    }

    #[test]
    fn a_remote_somewhere_else_is_a_state_not_a_github_repository() {
        let (host, owner, repo) = parse_remote("git@gitlab.com:group/thing.git").unwrap();
        assert!(!github_host(&host));
        assert_eq!((owner.as_str(), repo.as_str()), ("group", "thing"));

        for url in [
            r"C:\Users\someone\repo",
            "/home/someone/repo",
            "file:///C:/Users/someone/repo",
            "https://github.com/MYY-sudo",
            "",
        ] {
            assert!(
                parse_remote(url).is_none(),
                "{url} was read as a repository"
            );
        }
    }

    /// The vault itself, not the trait. Uses a disposable service name so a developer's own stored
    /// token is never touched.
    #[cfg(windows)]
    #[test]
    fn the_credential_vault_round_trips_a_token() {
        let vault = Vault::new("com.tbce.app.test", "github.com.test");
        let _ = vault.clear();

        assert_eq!(vault.read().unwrap(), None);
        vault.write("ghp_disposable").unwrap();
        assert_eq!(vault.read().unwrap().as_deref(), Some("ghp_disposable"));
        vault.clear().unwrap();
        assert_eq!(vault.read().unwrap(), None);
        // Clearing an entry that is already gone is not a failure.
        vault.clear().unwrap();
    }
}
