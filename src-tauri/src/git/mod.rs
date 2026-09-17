use crate::filesystem::{validate_relative, Result, ServiceError};
use crate::process::{self, Capture, Run, CAPTURE_CAP};
use serde::Serialize;
use std::{
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
    time::Duration,
};

const DETECT_LIMIT: Duration = Duration::from_secs(10);
const LOCAL_LIMIT: Duration = Duration::from_secs(30);
const NETWORK_LIMIT: Duration = Duration::from_secs(300);
const PATCH_CAP: usize = 1024 * 1024;
const HISTORY_MAX: u32 = 200;
const LOG_FORMAT: &str = "--format=%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cI%x1f%s%x1f%D";

// Applied to every invocation. All of these are per-process overrides; nothing is ever stored,
// and no global or system configuration is written.
const COMMON: &[&str] = &[
    "--no-optional-locks",
    // Without this, paths outside ASCII come back as C-style escapes such as "\303\247".
    "-c",
    "core.quotePath=false",
    "-c",
    "core.editor=false",
    "-c",
    "core.pager=cat",
    "-c",
    "color.ui=false",
    "-c",
    "advice.detachedHead=false",
    // Executable transport helpers must never run, even if a remote URL slips through validation.
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "protocol.fd.allow=never",
];

// Credential helpers and SSH keys are the user's existing setup, so the environment is narrowed
// rather than cleared: GIT_CONFIG_NOSYSTEM would drop the Windows credential manager, and
// GIT_SSH_COMMAND would override a configured core.sshCommand.
const ENV: &[(&str, Option<&str>)] = &[
    ("GIT_TERMINAL_PROMPT", Some("0")),
    ("GIT_OPTIONAL_LOCKS", Some("0")),
    ("GIT_PAGER", Some("cat")),
    ("GIT_EDITOR", Some("false")),
    ("GIT_FLUSH", Some("1")),
    // Stable, parseable diagnostics for classification.
    ("LC_ALL", Some("C")),
];

/// Ordered (lowercased stderr needle, error code) pairs tried against a failed invocation.
type Table = &'static [(&'static str, &'static str)];

/// Shared classification for anything that talks to a remote.
const NETWORK_TABLE: Table = &[
    ("could not read username", "AUTH_FAILED"),
    ("could not read password", "AUTH_FAILED"),
    ("authentication failed", "AUTH_FAILED"),
    ("permission denied (publickey)", "AUTH_FAILED"),
    ("invalid username or token", "AUTH_FAILED"),
    ("terminal prompts disabled", "AUTH_FAILED"),
    ("not possible to fast-forward", "DIVERGED"),
    ("divergent branches", "DIVERGED"),
    ("need to specify how to reconcile", "DIVERGED"),
    ("non-fast-forward", "PUSH_REJECTED"),
    ("fetch first", "PUSH_REJECTED"),
    ("[rejected]", "PUSH_REJECTED"),
    ("no tracking information", "NO_UPSTREAM"),
    ("no upstream", "NO_UPSTREAM"),
    ("does not appear to be a git repository", "NO_REMOTE"),
    ("no such remote", "NO_REMOTE"),
    ("could not resolve host", "NETWORK_FAILED"),
    ("connection timed out", "NETWORK_FAILED"),
    ("failed to connect", "NETWORK_FAILED"),
    ("ssl certificate problem", "NETWORK_FAILED"),
];

const NO_TABLE: Table = &[];

fn git_missing() -> ServiceError {
    ServiceError::new(
        "GIT_MISSING",
        "Git was not found. Install Git and restart TBCE.",
    )
}

/// Removes credentials from any text that can reach the interface. Git echoes remote URLs in its
/// diagnostics, and an HTTPS URL can carry a token in its userinfo.
fn redact(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("://") {
        let (head, tail) = rest.split_at(start + 3);
        result.push_str(head);
        // Userinfo ends at '@' and cannot reach past whitespace or the start of the path.
        let stop = tail
            .find(|c: char| c.is_whitespace() || c == '/')
            .unwrap_or(tail.len());
        match tail[..stop].find('@') {
            Some(at) => {
                let userinfo = &tail[..at];
                match userinfo.find(':') {
                    Some(colon) => {
                        result.push_str(&userinfo[..colon]);
                        result.push_str(":***");
                    }
                    None => result.push_str("***"),
                }
                result.push('@');
                rest = &tail[at + 1..];
            }
            None => rest = tail,
        }
    }
    result.push_str(rest);
    result
}

fn summary(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Git reported an error.")
        .trim_start_matches("fatal: ")
        .trim_start_matches("error: ")
        .to_string()
}

fn classify(stderr: &str, table: Table) -> ServiceError {
    let text = redact(stderr);
    let lower = text.to_lowercase();
    for (needle, code) in table {
        if lower.contains(needle) {
            return ServiceError::new(code, summary(&text));
        }
    }
    ServiceError::new("GIT_FAILED", summary(&text))
}

/// Runs Git with an argument array. No shell, no console window, no interactive prompt.
fn invoke(root: &Path, args: &[&str], limit: Duration, cap: usize) -> Result<Capture> {
    let mut full: Vec<OsString> = COMMON.iter().map(OsString::from).collect();
    full.extend(args.iter().map(OsString::from));
    let env: Vec<(&str, Option<OsString>)> = ENV
        .iter()
        .map(|(key, value)| (*key, value.map(OsString::from)))
        .collect();
    process::run(Run {
        program: OsStr::new("git"),
        args: &full,
        cwd: root,
        env: &env,
        limit,
        cap,
    })
    .map_err(|error| match error.code {
        "NOT_FOUND" => git_missing(),
        "TIMED_OUT" => ServiceError::new(
            "GIT_TIMED_OUT",
            "The Git operation took too long and was stopped.",
        ),
        _ => error,
    })
}

fn checked(
    root: &Path,
    args: &[&str],
    limit: Duration,
    cap: usize,
    table: Table,
) -> Result<Capture> {
    let capture = invoke(root, args, limit, cap)?;
    if capture.code == 0 {
        return Ok(capture);
    }
    Err(classify(&capture.stderr, table))
}

fn text(capture: &Capture) -> String {
    String::from_utf8_lossy(&capture.stdout).into_owned()
}

fn display(path: &str) -> String {
    path.trim_start_matches(r"\\?\").to_string()
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Head {
    Unborn { branch: String },
    Branch { name: String, oid: String },
    Detached { oid: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub root: String,
    pub git_dir: String,
    pub common_dir: String,
    pub linked_worktree: bool,
    pub bare: bool,
    pub head: Head,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Detection {
    None,
    Found {
        repository: Box<Repository>,
    },
    /// A repository exists above the open folder. Its location is reported, but the folder must be
    /// opened at the repository root before anything may be read or changed.
    Parent {
        root: String,
    },
    /// Git is missing, too slow, or failing. Detection never fails the caller, so opening a folder
    /// keeps working when Git does not.
    Unavailable {
        code: &'static str,
        message: String,
    },
}

#[derive(Debug)]
pub struct GitService {
    root: PathBuf,
    repository: Repository,
}

fn head_of(root: &Path) -> Result<Head> {
    let symbolic = invoke(
        root,
        &["symbolic-ref", "--quiet", "--short", "HEAD"],
        DETECT_LIMIT,
        CAPTURE_CAP,
    )?;
    let commit = invoke(
        root,
        &["rev-parse", "--verify", "--quiet", "HEAD"],
        DETECT_LIMIT,
        CAPTURE_CAP,
    )?;
    let oid = text(&commit).trim().to_string();
    let branch = text(&symbolic).trim().to_string();
    Ok(match (symbolic.code == 0, commit.code == 0) {
        // HEAD points at a branch that has no commit yet.
        (true, false) => Head::Unborn { branch },
        (true, true) => Head::Branch { name: branch, oid },
        _ => Head::Detached { oid },
    })
}

fn resolve(root: &Path) -> Result<Option<Repository>> {
    // --show-toplevel fails inside a bare repository, so the flags are read first and the
    // working-tree question is only asked when there is a working tree.
    let flags = invoke(
        root,
        &[
            "rev-parse",
            "--is-bare-repository",
            "--path-format=absolute",
            "--git-dir",
            "--git-common-dir",
        ],
        DETECT_LIMIT,
        CAPTURE_CAP,
    )?;
    if flags.code != 0 {
        if flags.stderr.to_lowercase().contains("not a git repository") {
            return Ok(None);
        }
        return Err(classify(&flags.stderr, NO_TABLE));
    }
    let output = text(&flags);
    let mut lines = output.lines();
    let bare = lines.next().unwrap_or("false").trim() == "true";
    let git_dir = lines.next().unwrap_or_default().trim().to_string();
    let common_dir = lines.next().unwrap_or_default().trim().to_string();
    let top = if bare {
        String::new()
    } else {
        let toplevel = checked(
            root,
            &["rev-parse", "--path-format=absolute", "--show-toplevel"],
            DETECT_LIMIT,
            CAPTURE_CAP,
            NO_TABLE,
        )?;
        text(&toplevel).trim().to_string()
    };
    Ok(Some(Repository {
        root: display(&top),
        // A linked worktree keeps its own git dir and shares the common dir with the main one.
        linked_worktree: !git_dir.is_empty() && git_dir != common_dir,
        git_dir: display(&git_dir),
        common_dir: display(&common_dir),
        bare,
        head: head_of(root)?,
    }))
}

/// True when the repository's top level is the folder the user opened. Both sides are
/// canonicalized, so drive-letter case and the verbatim prefix cannot produce a false mismatch.
fn is_root(root: &Path, repository: &Repository) -> bool {
    if repository.bare {
        return false;
    }
    match (
        std::fs::canonicalize(root),
        std::fs::canonicalize(&repository.root),
    ) {
        (Ok(opened), Ok(top)) => opened == top,
        _ => false,
    }
}

impl GitService {
    /// Never returns `Err`: a missing or failing Git is reported as `Unavailable` so that opening
    /// a folder is never blocked by the state of the user's Git installation.
    pub fn detect(root: &Path) -> Detection {
        match resolve(root) {
            Ok(None) => Detection::None,
            Ok(Some(repository)) => {
                if repository.bare || is_root(root, &repository) {
                    Detection::Found {
                        repository: Box::new(repository),
                    }
                } else {
                    Detection::Parent {
                        root: repository.root,
                    }
                }
            }
            Err(error) => Detection::Unavailable {
                code: error.code,
                message: error.message,
            },
        }
    }

    pub fn open(root: &Path) -> Result<Self> {
        let repository = resolve(root)?.ok_or_else(|| {
            ServiceError::new("NOT_A_REPOSITORY", "This folder is not a Git repository.")
        })?;
        if repository.bare {
            return Err(ServiceError::new(
                "BARE_REPOSITORY",
                "This is a bare repository and has no working tree.",
            ));
        }
        if !is_root(root, &repository) {
            return Err(ServiceError::new(
                "REPOSITORY_NOT_ROOT",
                format!(
                    "This folder sits inside the repository at {}. Open that folder to use Git.",
                    repository.root
                ),
            ));
        }
        Ok(Self {
            root: root.to_path_buf(),
            repository,
        })
    }

    fn run(&self, args: &[&str], table: Table) -> Result<Capture> {
        checked(&self.root, args, LOCAL_LIMIT, CAPTURE_CAP, table)
    }

    pub fn status(&self) -> Result<Status> {
        let capture = self.run(
            &[
                "status",
                "--porcelain=v2",
                "--branch",
                "--untracked-files=normal",
                "--renames",
                "-z",
            ],
            NO_TABLE,
        )?;
        // A half-read status would understate the changes, which is worse than refusing it.
        if capture.truncated {
            return Err(ServiceError::new(
                "GIT_OUTPUT_TOO_LARGE",
                "This repository reports more changes than TBCE can read at once.",
            ));
        }
        Ok(self.parse_status(&capture.stdout))
    }

    fn parse_status(&self, data: &[u8]) -> Status {
        let mut status = Status {
            repository: self.repository.clone(),
            branch: None,
            upstream: None,
            ahead: None,
            behind: None,
            staged: Vec::new(),
            unstaged: Vec::new(),
            untracked: Vec::new(),
            conflicts: Vec::new(),
        };
        let mut records = data.split(|byte| *byte == 0).filter(|r| !r.is_empty());
        while let Some(record) = records.next() {
            let line = String::from_utf8_lossy(record).into_owned();
            if let Some(rest) = line.strip_prefix("# branch.head ") {
                if rest != "(detached)" {
                    status.branch = Some(rest.to_string());
                }
                continue;
            }
            if let Some(rest) = line.strip_prefix("# branch.upstream ") {
                status.upstream = Some(rest.to_string());
                continue;
            }
            if let Some(rest) = line.strip_prefix("# branch.ab ") {
                // This header is absent entirely without an upstream, which is the null the
                // interface reports rather than a misleading zero.
                let mut parts = rest.split(' ');
                status.ahead = parts
                    .next()
                    .and_then(|value| value.strip_prefix('+'))
                    .and_then(|value| value.parse().ok());
                status.behind = parts
                    .next()
                    .and_then(|value| value.strip_prefix('-'))
                    .and_then(|value| value.parse().ok());
                continue;
            }
            if line.starts_with('#') {
                continue;
            }
            match line.chars().next() {
                Some('1') => {
                    let fields: Vec<&str> = line.splitn(9, ' ').collect();
                    if let [_, xy, .., path] = fields.as_slice() {
                        if fields.len() == 9 {
                            record_change(&mut status, xy, path, None);
                        }
                    }
                }
                Some('2') => {
                    // A rename or copy stores its original path in the NEXT record, not in this one.
                    let original = records
                        .next()
                        .map(|value| String::from_utf8_lossy(value).into_owned());
                    let fields: Vec<&str> = line.splitn(10, ' ').collect();
                    if fields.len() == 10 {
                        record_change(&mut status, fields[1], fields[9], original);
                    }
                }
                Some('u') => {
                    let fields: Vec<&str> = line.splitn(11, ' ').collect();
                    if fields.len() == 11 {
                        status.conflicts.push(Conflict {
                            path: fields[10].to_string(),
                            state: conflict_state(fields[1]),
                        });
                    }
                }
                Some('?') => status.untracked.push(line[2..].to_string()),
                _ => {}
            }
        }
        status
    }

    pub fn branches(&self, fallback: Option<&str>) -> Result<Branches> {
        let capture = self.run(
            &[
                "for-each-ref",
                "--format=%(refname)%00%(refname:short)%00%(objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(HEAD)%00%(worktreepath)%00%(symref)",
                "refs/heads",
                "refs/remotes",
            ],
            NO_TABLE,
        )?;
        let (mut local, mut remote) = (Vec::new(), Vec::new());
        for line in text(&capture).lines() {
            let fields: Vec<&str> = line.split('\0').collect();
            let [full, name, oid, upstream, track, head, worktree, symref] = fields.as_slice()
            else {
                continue;
            };
            // refs/remotes/<remote>/HEAD is a symbolic alias, not a branch anyone can check out.
            if !symref.is_empty() {
                continue;
            }
            let (ahead, behind, gone) = tracking(track, upstream);
            let branch = Branch {
                name: (*name).to_string(),
                oid: (*oid).to_string(),
                upstream: (!upstream.is_empty()).then(|| (*upstream).to_string()),
                ahead,
                behind,
                gone,
                current: *head == "*",
                worktree: (!worktree.is_empty()).then(|| display(worktree)),
                remote: full.starts_with("refs/remotes/"),
            };
            if branch.remote {
                remote.push(branch);
            } else {
                local.push(branch);
            }
        }
        let (current, detached) = match &self.repository.head {
            Head::Branch { name, .. } => (Some(name.clone()), false),
            Head::Unborn { branch } => (Some(branch.clone()), false),
            Head::Detached { .. } => (None, true),
        };
        Ok(Branches {
            default_branch: self.default_of(&local, fallback),
            current,
            detached,
            local,
            remote,
        })
    }

    /// The remote's published HEAD is the most trustworthy answer; the project's recorded default
    /// branch and the conventional names are consulted only when it is unavailable.
    fn default_of(&self, local: &[Branch], fallback: Option<&str>) -> Option<String> {
        let has = |name: &str| local.iter().any(|branch| branch.name == name);
        if let Ok(capture) = invoke(
            &self.root,
            &[
                "symbolic-ref",
                "--quiet",
                "--short",
                "refs/remotes/origin/HEAD",
            ],
            LOCAL_LIMIT,
            CAPTURE_CAP,
        ) {
            if capture.code == 0 {
                let value = text(&capture);
                let name = value.trim().trim_start_matches("origin/");
                if !name.is_empty() && has(name) {
                    return Some(name.to_string());
                }
            }
        }
        fallback
            .map(str::trim)
            .filter(|name| !name.is_empty() && has(name))
            .map(str::to_string)
            .or_else(|| {
                ["main", "master"]
                    .into_iter()
                    .find(|name| has(name))
                    .map(str::to_string)
            })
    }

    pub fn stage(&self, paths: &[String]) -> Result<Status> {
        // --all under a pathspec stages deletions as well as edits.
        let args = pathspec(&["add", "--all"], paths)?;
        self.run(&args, NO_TABLE)?;
        self.status()
    }

    pub fn stage_all(&self) -> Result<Status> {
        self.run(&["add", "--all", "--"], NO_TABLE)?;
        self.status()
    }

    pub fn unstage(&self, paths: &[String]) -> Result<Status> {
        // Before the first commit there is no HEAD to reset against, so the entry is dropped from
        // the index instead. Either way the working file is left byte for byte as it was.
        let args = match self.repository.head {
            Head::Unborn { .. } => pathspec(&["rm", "--cached", "-r", "--quiet"], paths)?,
            _ => pathspec(&["reset", "--quiet", "HEAD"], paths)?,
        };
        self.run(&args, NO_TABLE)?;
        self.status()
    }

    /// Commits what is in the index. Working-tree contents are never staged implicitly, and no
    /// editor buffer is saved or discarded on the caller's behalf.
    pub fn commit(&self, message: &str) -> Result<Commit> {
        if message.trim().is_empty() || message.contains('\0') {
            return Err(ServiceError::new(
                "INVALID_MESSAGE",
                "Enter a commit message.",
            ));
        }
        self.identity()?;
        let status = self.status()?;
        if !status.conflicts.is_empty() {
            return Err(ServiceError::new(
                "CONFLICTED",
                "Resolve the conflicted files before committing.",
            ));
        }
        if status.staged.is_empty() {
            return Err(ServiceError::new(
                "NOTHING_STAGED",
                "Stage the changes you want to commit first.",
            ));
        }
        self.run(
            &[
                "commit",
                "--quiet",
                "--cleanup=strip",
                "--no-edit",
                "--message",
                message,
            ],
            NO_TABLE,
        )?;
        self.history(0, 1, None)?
            .commits
            .into_iter()
            .next()
            .ok_or_else(|| ServiceError::new("GIT_FAILED", "The commit could not be read back."))
    }

    /// The identity is the user's own configuration; a missing one is reported, never written.
    fn identity(&self) -> Result<()> {
        for key in ["user.name", "user.email"] {
            let capture = invoke(
                &self.root,
                &["config", "--get", key],
                LOCAL_LIMIT,
                CAPTURE_CAP,
            )?;
            if capture.code != 0 || text(&capture).trim().is_empty() {
                return Err(ServiceError::new(
                    "MISSING_IDENTITY",
                    "Set your Git user name and email before committing.",
                ));
            }
        }
        Ok(())
    }

    /// Creates a branch without switching to it.
    pub fn create_branch(&self, name: &str, start: Option<&str>) -> Result<()> {
        validate_branch_name(name)?;
        if let Some(start) = start {
            validate_reference(start)?;
        }
        if matches!(self.repository.head, Head::Unborn { .. }) && start.is_none() {
            return Err(ServiceError::new(
                "UNBORN_BRANCH",
                "Make the first commit before creating a branch.",
            ));
        }
        let table: Table = &[
            ("already exists", "BRANCH_EXISTS"),
            ("not a valid object name", "INVALID_REF"),
            ("not a valid branch name", "INVALID_BRANCH_NAME"),
        ];
        let mut args = vec!["branch", name];
        if let Some(start) = start {
            args.push(start);
        }
        self.run(&args, table)?;
        Ok(())
    }

    /// Switches branches only when nothing would be lost. Force is never used.
    pub fn checkout(&self, name: &str) -> Result<Status> {
        validate_branch_name(name)?;
        let status = self.status()?;
        if !status.staged.is_empty() || !status.unstaged.is_empty() || !status.conflicts.is_empty()
        {
            return Err(ServiceError::new(
                "DIRTY_WORKTREE",
                "Commit or undo your changes before switching branches.",
            ));
        }
        let table: Table = &[
            ("did not match any", "BRANCH_NOT_FOUND"),
            ("is already checked out", "BRANCH_IN_USE"),
            ("would be overwritten", "DIRTY_WORKTREE"),
        ];
        self.run(&["checkout", "--no-guess", name], table)?;
        // HEAD moved, so the repository is resolved again rather than reusing a stale one.
        GitService::open(&self.root)?.status()
    }

    /// Deletes a branch that is safe to delete. The caller confirms first; these checks exist so
    /// that invoking the command directly cannot bypass the protections either.
    pub fn delete_branch(&self, name: &str, recorded_default: Option<&str>) -> Result<()> {
        validate_branch_name(name)?;
        let branches = self.branches(recorded_default)?;
        let branch = branches
            .local
            .iter()
            .find(|branch| branch.name == name)
            .ok_or_else(|| {
                ServiceError::new(
                    "BRANCH_NOT_FOUND",
                    format!("There is no branch named {name}."),
                )
            })?;
        if branch.current {
            return Err(ServiceError::new(
                "CURRENT_BRANCH",
                "Switch to another branch before deleting this one.",
            ));
        }
        if branches.default_branch.as_deref() == Some(name) {
            return Err(ServiceError::new(
                "PROTECTED_BRANCH",
                "The default branch cannot be deleted.",
            ));
        }
        if branch.worktree.is_some() {
            return Err(ServiceError::new(
                "BRANCH_IN_USE",
                "This branch is checked out in another worktree.",
            ));
        }
        // -d, never -D: Git itself refuses a branch whose work is not merged anywhere.
        let table: Table = &[("not fully merged", "UNMERGED_BRANCH")];
        self.run(&["branch", "-d", name], table)?;
        Ok(())
    }

    /// One bounded page of history. An unborn branch has no commits, which is an empty page.
    pub fn history(&self, skip: u32, limit: u32, path: Option<&str>) -> Result<History> {
        let limit = limit.clamp(1, HISTORY_MAX);
        let skip = skip.min(u32::MAX / 2);
        let skip_arg = format!("--skip={skip}");
        // One extra commit is requested purely to learn whether another page exists.
        let count_arg = format!("--max-count={}", limit + 1);
        let mut args = vec![
            "log",
            "-z",
            "--no-show-signature",
            "--no-ext-diff",
            "--no-textconv",
            &skip_arg,
            &count_arg,
            "--date=iso-strict",
            LOG_FORMAT,
        ];
        if let Some(path) = path {
            validate_path(path)?;
            args.push("--");
            args.push(path);
        }
        let capture = invoke(&self.root, &args, LOCAL_LIMIT, CAPTURE_CAP)?;
        if capture.code != 0 {
            if capture
                .stderr
                .to_lowercase()
                .contains("does not have any commits yet")
            {
                return Ok(History {
                    commits: Vec::new(),
                    skip,
                    has_more: false,
                });
            }
            return Err(classify(&capture.stderr, NO_TABLE));
        }
        let mut commits: Vec<Commit> = capture
            .stdout
            .split(|byte| *byte == 0)
            .filter(|record| !record.is_empty())
            .filter_map(|record| parse_commit(&String::from_utf8_lossy(record)))
            .collect();
        let has_more = commits.len() > limit as usize;
        commits.truncate(limit as usize);
        Ok(History {
            commits,
            skip,
            has_more,
        })
    }

    /// Per-file counts for everything changed on one side of the index.
    pub fn diff_summary(&self, staged: bool) -> Result<Vec<DiffStat>> {
        self.numstat(staged, None)
    }

    pub fn diff(&self, path: &str, staged: bool) -> Result<FileDiff> {
        validate_path(path)?;
        let stat = self.numstat(staged, Some(path))?.into_iter().next();
        let (added, removed, binary, original_path) = match stat {
            Some(stat) => (stat.added, stat.removed, stat.binary, stat.original_path),
            // Nothing changed on this side, which is an empty diff rather than an error.
            None => (Some(0), Some(0), false, None),
        };
        let mut patch = String::new();
        let mut truncated = false;
        if !binary {
            let mut args = vec![
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--find-renames",
                "--unified=3",
            ];
            if staged {
                args.push("--cached");
            }
            args.push("--");
            args.push(path);
            let capture = checked(&self.root, &args, LOCAL_LIMIT, PATCH_CAP, NO_TABLE)?;
            patch = String::from_utf8_lossy(&capture.stdout).into_owned();
            truncated = capture.truncated;
            if truncated {
                // Cut back to the last complete line so a patch never ends mid-line.
                if let Some(end) = patch.rfind('\n') {
                    patch.truncate(end + 1);
                }
            }
        }
        Ok(FileDiff {
            path: path.to_string(),
            original_path,
            staged,
            binary,
            truncated,
            added,
            removed,
            patch,
        })
    }

    fn numstat(&self, staged: bool, path: Option<&str>) -> Result<Vec<DiffStat>> {
        let mut args = vec![
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--numstat",
            "-z",
            "--find-renames",
        ];
        if staged {
            args.push("--cached");
        }
        args.push("--");
        if let Some(path) = path {
            args.push(path);
        }
        let capture = self.run(&args, NO_TABLE)?;
        let mut stats = Vec::new();
        let mut records = capture.stdout.split(|byte| *byte == 0);
        while let Some(record) = records.next() {
            if record.is_empty() {
                continue;
            }
            let line = String::from_utf8_lossy(record).into_owned();
            let mut fields = line.splitn(3, '\t');
            let added = fields.next().unwrap_or("-").to_string();
            let removed = fields.next().unwrap_or("-").to_string();
            let name = fields.next().unwrap_or("").to_string();
            // A rename leaves the path field empty and reports its two paths as the next two
            // records instead.
            let (path, original) = if name.is_empty() {
                let from = records
                    .next()
                    .map(|value| String::from_utf8_lossy(value).into_owned())
                    .unwrap_or_default();
                let to = records
                    .next()
                    .map(|value| String::from_utf8_lossy(value).into_owned())
                    .unwrap_or_default();
                (to, Some(from))
            } else {
                (name, None)
            };
            stats.push(DiffStat {
                // Git reports a binary file as a dash in both count columns.
                binary: added == "-" && removed == "-",
                added: added.parse().ok(),
                removed: removed.parse().ok(),
                path,
                original_path: original,
            });
        }
        Ok(stats)
    }

    /// Resolves which remote an operation talks to, preferring the one the branch already tracks.
    fn remote_of(&self, explicit: Option<&str>) -> Result<String> {
        let configured = self.remotes()?;
        let missing = || {
            ServiceError::new(
                "NO_REMOTE",
                "This repository has no remote to exchange commits with.",
            )
        };
        if let Some(name) = explicit {
            return configured
                .into_iter()
                .find(|remote| remote == name)
                .ok_or_else(missing);
        }
        let branches = self.branches(None)?;
        let tracked = branches
            .local
            .iter()
            .find(|branch| branch.current)
            .and_then(|branch| branch.upstream.as_deref())
            .and_then(|upstream| upstream.split_once('/'))
            .map(|(remote, _)| remote.to_string())
            .filter(|remote| configured.contains(remote));
        tracked
            .or_else(|| match configured.as_slice() {
                [only] => Some(only.clone()),
                _ => configured.iter().find(|name| *name == "origin").cloned(),
            })
            .ok_or_else(missing)
    }

    fn remotes(&self) -> Result<Vec<String>> {
        let capture = self.run(&["remote"], NO_TABLE)?;
        Ok(text(&capture)
            .lines()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect())
    }

    /// The name and URL of the remote an operation would talk to, or nothing when there is none.
    /// Remote identity is read here rather than accepted from the webview, which is what lets the
    /// GitHub service work out which repository the open folder belongs to.
    pub fn remote_url(&self) -> Result<Option<(String, String)>> {
        let remote = match self.remote_of(None) {
            Ok(remote) => remote,
            Err(error) if error.code == "NO_REMOTE" => return Ok(None),
            Err(error) => return Err(error),
        };
        let capture = self.run(&["remote", "get-url", "--", &remote], NO_TABLE)?;
        Ok(Some((remote, text(&capture).trim().to_string())))
    }

    /// Checks the configured URL before every exchange, so a remote that was reconfigured to an
    /// executable transport after cloning still cannot run one.
    fn checked_remote(&self, explicit: Option<&str>) -> Result<String> {
        let remote = self.remote_of(explicit)?;
        let capture = self.run(&["remote", "get-url", "--", &remote], NO_TABLE)?;
        validate_remote(text(&capture).trim())?;
        Ok(remote)
    }

    pub fn fetch(&self, remote: Option<&str>) -> Result<Status> {
        let remote = self.checked_remote(remote)?;
        checked(
            &self.root,
            &["fetch", "--prune", "--no-recurse-submodules", "--", &remote],
            NETWORK_LIMIT,
            CAPTURE_CAP,
            NETWORK_TABLE,
        )?;
        self.status()
    }

    /// Fast-forward only. Merge and rebase workflows are deliberately outside this milestone, so a
    /// divergence is reported rather than resolved.
    pub fn pull(&self) -> Result<Status> {
        match self.repository.head {
            Head::Detached { .. } => {
                return Err(ServiceError::new(
                    "DETACHED_HEAD",
                    "Switch to a branch before pulling.",
                ))
            }
            Head::Unborn { .. } => {
                return Err(ServiceError::new(
                    "UNBORN_BRANCH",
                    "This branch has no commits yet.",
                ))
            }
            Head::Branch { .. } => {}
        }
        let status = self.status()?;
        if status.upstream.is_none() {
            return Err(ServiceError::new(
                "NO_UPSTREAM",
                "This branch does not track a remote branch yet.",
            ));
        }
        if !status.staged.is_empty() || !status.unstaged.is_empty() || !status.conflicts.is_empty()
        {
            return Err(ServiceError::new(
                "DIRTY_WORKTREE",
                "Commit or undo your changes before pulling.",
            ));
        }
        self.checked_remote(None)?;
        checked(
            &self.root,
            &[
                "pull",
                "--ff-only",
                "--no-rebase",
                "--no-autostash",
                "--no-recurse-submodules",
            ],
            NETWORK_LIMIT,
            CAPTURE_CAP,
            NETWORK_TABLE,
        )?;
        self.status()
    }

    /// Never forced. A rejected push means the remote has commits this repository does not.
    pub fn push(&self, set_upstream: bool) -> Result<Status> {
        let Head::Branch { ref name, .. } = self.repository.head else {
            return Err(ServiceError::new(
                "DETACHED_HEAD",
                "Switch to a branch with commits before pushing.",
            ));
        };
        let remote = self.checked_remote(None)?;
        let mut args = vec!["push", "--no-recurse-submodules", "--no-force-with-lease"];
        if set_upstream {
            args.push("--set-upstream");
        }
        args.push("--");
        args.push(&remote);
        args.push(name);
        checked(&self.root, &args, NETWORK_LIMIT, CAPTURE_CAP, NETWORK_TABLE)?;
        self.status()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    /// Set only on the staged side of a rename or copy.
    pub original_path: Option<String>,
    pub state: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub path: String,
    pub state: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub repository: Repository,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    /// Null without an upstream to compare against.
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub staged: Vec<Change>,
    pub unstaged: Vec<Change>,
    pub untracked: Vec<String>,
    pub conflicts: Vec<Conflict>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub oid: String,
    pub upstream: Option<String>,
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub gone: bool,
    pub current: bool,
    /// The worktree that has this branch checked out, when one does.
    pub worktree: Option<String>,
    pub remote: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branches {
    pub current: Option<String>,
    pub detached: bool,
    pub default_branch: Option<String>,
    pub local: Vec<Branch>,
    pub remote: Vec<Branch>,
}

fn change_state(code: char) -> Option<&'static str> {
    Some(match code {
        'A' => "added",
        'M' => "modified",
        'D' => "deleted",
        'R' => "renamed",
        'C' => "copied",
        'T' => "typeChanged",
        // '.' means unchanged on that side.
        _ => return None,
    })
}

fn conflict_state(code: &str) -> &'static str {
    match code {
        "DD" => "bothDeleted",
        "AU" => "addedByUs",
        "UD" => "deletedByThem",
        "UA" => "addedByThem",
        "DU" => "deletedByUs",
        "AA" => "bothAdded",
        _ => "bothModified",
    }
}

// The index and worktree columns are independent, so one file legitimately appears in both lists
// with different states.
fn record_change(status: &mut Status, xy: &str, path: &str, original: Option<String>) {
    let mut columns = xy.chars();
    let index = columns.next().unwrap_or('.');
    let worktree = columns.next().unwrap_or('.');
    if let Some(state) = change_state(index) {
        status.staged.push(Change {
            path: path.to_string(),
            original_path: original,
            state,
        });
    }
    if let Some(state) = change_state(worktree) {
        status.unstaged.push(Change {
            path: path.to_string(),
            original_path: None,
            state,
        });
    }
}

fn tracking(track: &str, upstream: &str) -> (Option<u32>, Option<u32>, bool) {
    if upstream.is_empty() {
        return (None, None, false);
    }
    if track.trim() == "gone" {
        return (None, None, true);
    }
    // An upstream that is exactly in sync reports no tracking text at all.
    let (mut ahead, mut behind) = (Some(0), Some(0));
    for part in track.split(',') {
        if let Some(value) = part.trim().strip_prefix("ahead ") {
            ahead = value.trim().parse().ok();
        }
        if let Some(value) = part.trim().strip_prefix("behind ") {
            behind = value.trim().parse().ok();
        }
    }
    (ahead, behind, false)
}

/// Creates a repository in a folder that is not one yet.
pub fn init(root: &Path, default_branch: Option<&str>) -> Result<Repository> {
    if resolve(root)?.is_some() {
        return Err(ServiceError::new(
            "ALREADY_EXISTS",
            "This folder is already a Git repository.",
        ));
    }
    let branch = default_branch
        .map(str::trim)
        .filter(|name| !name.is_empty());
    if let Some(name) = branch {
        validate_branch_name(name)?;
    }
    let setting = format!("init.defaultBranch={}", branch.unwrap_or("main"));
    checked(
        root,
        &["-c", &setting, "init", "--"],
        LOCAL_LIMIT,
        CAPTURE_CAP,
        NO_TABLE,
    )?;
    resolve(root)?
        .ok_or_else(|| ServiceError::new("GIT_FAILED", "The repository could not be created."))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneOutcome {
    pub path: String,
    pub name: String,
    pub default_branch: Option<String>,
}

/// Accepts HTTPS, SSH, `file://` and local repository paths. Transport helpers such as `ext::`
/// name an external program to run, so they are refused outright rather than relied on being
/// blocked by configuration alone.
pub fn validate_remote(source: &str) -> Result<()> {
    let invalid = |message: &str| ServiceError::new("UNSUPPORTED_REMOTE", message.to_string());
    let value = source.trim();
    if value.is_empty() {
        return Err(invalid("Enter a repository location."));
    }
    if value.starts_with('-') || value.chars().any(char::is_control) {
        return Err(invalid("This repository location is not valid."));
    }
    if value.split('/').next().unwrap_or(value).contains("::") {
        return Err(invalid(
            "Transport helper locations such as ext:: are not supported.",
        ));
    }
    let lower = value.to_ascii_lowercase();
    for scheme in ["https://", "ssh://", "file://"] {
        if lower.starts_with(scheme) {
            return Ok(());
        }
    }
    if lower.starts_with("git://") || lower.starts_with("http://") {
        return Err(invalid(
            "Unencrypted git:// and http:// transports are not supported. Use HTTPS or SSH.",
        ));
    }
    if lower.contains("://") {
        return Err(invalid(
            "Only HTTPS, SSH, file:// and local repository paths are supported.",
        ));
    }
    // A Windows drive letter is a local path, not an scp-style host.
    let drive =
        value.len() > 1 && value.as_bytes()[1] == b':' && value.as_bytes()[0].is_ascii_alphabetic();
    if !drive {
        if let Some((host, path)) = value.split_once(':') {
            if host.contains('@') && !path.is_empty() {
                return Ok(());
            }
        }
    }
    let path = Path::new(value);
    if path.is_absolute() && path.exists() {
        return Ok(());
    }
    Err(invalid(
        "Enter an HTTPS or SSH URL, or the path of a local repository.",
    ))
}

/// Clones into a new directory beneath a parent the user picked natively. An existing destination
/// is never written into, and a failed clone removes only what this call created.
pub fn clone(source: &str, parent: &Path, folder: &str) -> Result<CloneOutcome> {
    validate_remote(source)?;
    let name = folder.trim();
    if name.is_empty() || !crate::filesystem::valid_name(name) || name.contains(['/', '\\']) {
        return Err(ServiceError::new(
            "INVALID_NAME",
            "Enter a folder name for the cloned repository.",
        ));
    }
    let destination = parent.join(name);
    if destination.exists() {
        return Err(ServiceError::new(
            "CLONE_TARGET_EXISTS",
            format!("{name} already exists here. Choose another name."),
        ));
    }
    let target = destination.to_string_lossy().into_owned();
    let result = checked(
        parent,
        &["clone", "--no-progress", "--", source.trim(), &target],
        NETWORK_LIMIT,
        CAPTURE_CAP,
        NETWORK_TABLE,
    );
    if let Err(error) = result {
        // Only this call could have created the destination, because it refused an existing one.
        let _ = std::fs::remove_dir_all(&destination);
        return Err(error);
    }
    let repository = resolve(&destination)?.ok_or_else(|| {
        ServiceError::new("GIT_FAILED", "The cloned folder is not a Git repository.")
    })?;
    Ok(CloneOutcome {
        default_branch: match &repository.head {
            Head::Branch { name, .. } => Some(name.clone()),
            Head::Unborn { branch } => Some(branch.clone()),
            Head::Detached { .. } => None,
        },
        path: repository.root,
        name: name.to_string(),
    })
}

/// Rejects names Git would refuse or that could be read as an option. `check-ref-format` is asked
/// second, so a malformed name never reaches a command as an argument.
pub fn validate_branch_name(name: &str) -> Result<()> {
    let invalid = |message: &str| ServiceError::new("INVALID_BRANCH_NAME", message.to_string());
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(invalid("Enter a branch name."));
    }
    if trimmed != name {
        return Err(invalid("A branch name cannot start or end with a space."));
    }
    if name.starts_with('-') {
        return Err(invalid("A branch name cannot start with a dash."));
    }
    if name == "HEAD" {
        return Err(invalid("HEAD is reserved and cannot be a branch name."));
    }
    if name.contains("..")
        || name.contains("@{")
        || name.ends_with(".lock")
        || name.ends_with('/')
        || name
            .chars()
            .any(|c| c.is_control() || " ~^:?*[\\".contains(c))
    {
        return Err(invalid(
            "A branch name cannot contain spaces or the characters ~ ^ : ? * [ \\ or ..",
        ));
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub oid: String,
    pub short_oid: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub authored_at: String,
    pub committed_at: String,
    pub summary: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub commits: Vec<Commit>,
    pub skip: u32,
    pub has_more: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStat {
    pub path: String,
    pub original_path: Option<String>,
    /// Null for a binary file, which has no line counts.
    pub added: Option<u32>,
    pub removed: Option<u32>,
    pub binary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub original_path: Option<String>,
    pub staged: bool,
    pub binary: bool,
    /// The patch was cut at the output limit and ends at its last complete line.
    pub truncated: bool,
    pub added: Option<u32>,
    pub removed: Option<u32>,
    pub patch: String,
}

fn parse_commit(record: &str) -> Option<Commit> {
    let fields: Vec<&str> = record.split('\x1f').collect();
    let [oid, short_oid, parents, author, email, authored_at, committed_at, summary, refs] =
        fields.as_slice()
    else {
        return None;
    };
    let split = |value: &str, separator: char| {
        value
            .split(separator)
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .map(str::to_string)
            .collect()
    };
    Some(Commit {
        oid: (*oid).to_string(),
        short_oid: (*short_oid).to_string(),
        parents: split(parents, ' '),
        author: (*author).to_string(),
        email: (*email).to_string(),
        authored_at: (*authored_at).to_string(),
        committed_at: (*committed_at).to_string(),
        summary: (*summary).to_string(),
        refs: split(refs, ','),
    })
}

/// A relative path inside the workspace, reusing the editor's own path rules. `.git` is a valid
/// name to those rules, which is correct here: Git may legitimately be asked about such a path.
fn validate_path(path: &str) -> Result<()> {
    if path.is_empty() {
        return Err(ServiceError::new("INVALID_PATH", "Select a file."));
    }
    validate_relative(path)
}

/// Builds `<base> -- <paths>`. Pathspecs always follow `--` so that no path can be read as an
/// option, and each one is validated before Git is started.
fn pathspec<'a>(base: &[&'a str], paths: &'a [String]) -> Result<Vec<&'a str>> {
    if paths.is_empty() {
        return Err(ServiceError::new(
            "INVALID_PATH",
            "Select at least one file.",
        ));
    }
    let mut args: Vec<&str> = base.to_vec();
    args.push("--");
    for path in paths {
        validate_path(path)?;
        args.push(path);
    }
    Ok(args)
}

/// A start point or revision. It is passed to Git for resolution; this only ensures it cannot be
/// mistaken for an option.
fn validate_reference(reference: &str) -> Result<()> {
    let invalid = || ServiceError::new("INVALID_REF", "Enter a valid branch, tag or commit.");
    if reference.trim().is_empty() || reference.starts_with('-') || reference.contains('\0') {
        return Err(invalid());
    }
    if reference.chars().any(char::is_control) {
        return Err(invalid());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const TEST_LIMIT: Duration = Duration::from_secs(60);

    // V01: every disposable path carries spaces and Turkish characters.
    fn sandbox() -> tempfile::TempDir {
        tempfile::Builder::new()
            .prefix("tbce git çalışma ğüşıöç ")
            .tempdir()
            .unwrap()
    }

    /// Raw Git, bypassing GitService, so results can be inspected independently of the code under
    /// test rather than by trusting what it returned.
    fn git(dir: &Path, args: &[&str]) -> String {
        let capture = invoke(dir, args, TEST_LIMIT, CAPTURE_CAP).unwrap();
        assert_eq!(capture.code, 0, "git {:?} failed: {}", args, capture.stderr);
        text(&capture)
    }

    fn try_git(dir: &Path, args: &[&str]) -> Capture {
        invoke(dir, args, TEST_LIMIT, CAPTURE_CAP).unwrap()
    }

    /// A repository whose behaviour does not depend on the settings of whoever runs the suite.
    /// Only this repository's own config is written; global and system config are never touched.
    fn repo(dir: &Path) {
        git(dir, &["-c", "init.defaultBranch=main", "init", "--"]);
        for (key, value) in [
            ("user.name", "TBCE Test"),
            ("user.email", "tbce@example.invalid"),
            ("commit.gpgsign", "false"),
            ("core.autocrlf", "false"),
        ] {
            git(dir, &["config", "--local", key, value]);
        }
    }

    fn commit(dir: &Path, message: &str) {
        git(dir, &["add", "-A", "--"]);
        git(dir, &["commit", "--quiet", "-m", message]);
    }

    fn found(root: &Path) -> Repository {
        match GitService::detect(root) {
            Detection::Found { repository } => *repository,
            other => panic!("expected a repository, got {other:?}"),
        }
    }

    #[test]
    fn detects_nothing_outside_a_repository() {
        let temp = sandbox();
        assert!(matches!(GitService::detect(temp.path()), Detection::None));
        assert_eq!(
            GitService::open(temp.path()).unwrap_err().code,
            "NOT_A_REPOSITORY"
        );
    }

    #[test]
    fn initializes_a_repository_and_reports_an_unborn_branch() {
        let temp = sandbox();
        // A branch name with a space is refused before Git is asked to create anything.
        assert_eq!(
            init(temp.path(), Some("ana dal")).unwrap_err().code,
            "INVALID_BRANCH_NAME"
        );
        assert!(!temp.path().join(".git").exists());

        let repository = init(temp.path(), Some("gelistirme")).unwrap();
        assert!(!repository.bare && !repository.linked_worktree);
        assert!(matches!(repository.head, Head::Unborn { ref branch } if branch == "gelistirme"));
        // Independent confirmation: Git itself reports the same HEAD.
        assert_eq!(
            git(temp.path(), &["symbolic-ref", "--short", "HEAD"]).trim(),
            "gelistirme"
        );
        assert_eq!(init(temp.path(), None).unwrap_err().code, "ALREADY_EXISTS");
    }

    #[test]
    fn reports_a_parent_repository_without_allowing_operations_inside_it() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("kok.txt"), b"root").unwrap();
        commit(temp.path(), "one");
        let inner = temp.path().join("alt klasör");
        fs::create_dir(&inner).unwrap();

        match GitService::detect(&inner) {
            Detection::Parent { root } => {
                assert!(fs::canonicalize(&root).unwrap() == fs::canonicalize(temp.path()).unwrap())
            }
            other => panic!("expected a parent repository, got {other:?}"),
        }
        assert_eq!(
            GitService::open(&inner).unwrap_err().code,
            "REPOSITORY_NOT_ROOT"
        );
        // The parent repository was not touched by the refused open.
        assert!(git(temp.path(), &["status", "--porcelain"])
            .trim()
            .is_empty());
    }

    #[test]
    fn status_separates_staged_and_unstaged_changes_to_one_file() {
        let temp = sandbox();
        repo(temp.path());
        let file = temp.path().join("dosya.txt");
        fs::write(&file, b"first\n").unwrap();
        commit(temp.path(), "one");

        fs::write(&file, b"staged\n").unwrap();
        git(temp.path(), &["add", "--", "dosya.txt"]);
        fs::write(&file, b"working\n").unwrap();

        let status = GitService::open(temp.path()).unwrap().status().unwrap();
        assert_eq!(status.branch.as_deref(), Some("main"));
        // No upstream exists, so ahead/behind are null rather than a misleading zero.
        assert_eq!(status.ahead, None);
        assert_eq!(status.behind, None);
        assert_eq!(status.staged.len(), 1);
        assert_eq!(status.staged[0].state, "modified");
        assert_eq!(status.unstaged.len(), 1);
        assert_eq!(status.unstaged[0].state, "modified");
        // The index and the working file genuinely differ, which is what the two lists claim.
        assert_eq!(git(temp.path(), &["show", ":dosya.txt"]), "staged\n");
        assert_eq!(fs::read(&file).unwrap(), b"working\n");
    }

    #[test]
    fn status_reports_renames_deletions_untracked_and_turkish_paths() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("eski ad.txt"), b"a\nb\n").unwrap();
        fs::write(temp.path().join("silinecek.txt"), b"gone\n").unwrap();
        commit(temp.path(), "one");

        git(temp.path(), &["mv", "eski ad.txt", "yeni ad ğüşıöç.txt"]);
        git(temp.path(), &["rm", "--quiet", "--", "silinecek.txt"]);
        fs::write(temp.path().join("yeni dosya.txt"), b"new\n").unwrap();

        let status = GitService::open(temp.path()).unwrap().status().unwrap();
        let renamed = status
            .staged
            .iter()
            .find(|change| change.state == "renamed")
            .expect("a rename");
        // The original path arrives as a separate NUL record and must be paired with its rename.
        assert_eq!(renamed.path, "yeni ad ğüşıöç.txt");
        assert_eq!(renamed.original_path.as_deref(), Some("eski ad.txt"));
        assert!(status
            .staged
            .iter()
            .any(|change| change.state == "deleted" && change.path == "silinecek.txt"));
        assert_eq!(status.untracked, vec!["yeni dosya.txt".to_string()]);
        // Independent confirmation that the path survived unquoted, byte for byte.
        assert!(temp.path().join("yeni ad ğüşıöç.txt").exists());
    }

    #[test]
    fn status_reports_a_detached_head() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        commit(temp.path(), "one");
        fs::write(temp.path().join("a.txt"), b"2\n").unwrap();
        commit(temp.path(), "two");
        let first = git(temp.path(), &["rev-parse", "HEAD~1"])
            .trim()
            .to_string();
        git(temp.path(), &["checkout", "--quiet", &first]);

        let repository = found(temp.path());
        assert!(matches!(repository.head, Head::Detached { ref oid } if *oid == first));
        let status = GitService::open(temp.path()).unwrap().status().unwrap();
        assert_eq!(status.branch, None);
        let branches = GitService::open(temp.path())
            .unwrap()
            .branches(None)
            .unwrap();
        assert!(branches.detached && branches.current.is_none());
    }

    #[test]
    fn status_reports_conflicts() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("c.txt"), b"base\n").unwrap();
        commit(temp.path(), "base");
        git(temp.path(), &["checkout", "--quiet", "-b", "yan-dal"]);
        fs::write(temp.path().join("c.txt"), b"theirs\n").unwrap();
        commit(temp.path(), "theirs");
        git(temp.path(), &["checkout", "--quiet", "main"]);
        fs::write(temp.path().join("c.txt"), b"ours\n").unwrap();
        commit(temp.path(), "ours");
        // A failing merge is the point of this fixture, so a nonzero exit is expected here.
        assert_ne!(try_git(temp.path(), &["merge", "yan-dal"]).code, 0);

        let status = GitService::open(temp.path()).unwrap().status().unwrap();
        assert_eq!(status.conflicts.len(), 1);
        assert_eq!(status.conflicts[0].path, "c.txt");
        assert_eq!(status.conflicts[0].state, "bothModified");
        // Git agrees that the index holds unmerged stages.
        assert!(!git(temp.path(), &["ls-files", "-u"]).trim().is_empty());
    }

    #[test]
    fn branches_report_the_current_branch_and_the_holding_worktree() {
        let temp = sandbox();
        let main = temp.path().join("ana depo");
        fs::create_dir(&main).unwrap();
        repo(&main);
        fs::write(main.join("a.txt"), b"1\n").unwrap();
        commit(&main, "one");
        git(&main, &["branch", "ikinci"]);
        let linked = temp.path().join("bağlı ağaç");
        git(
            &main,
            &[
                "worktree",
                "add",
                "--quiet",
                linked.to_str().unwrap(),
                "ikinci",
            ],
        );

        let branches = GitService::open(&main).unwrap().branches(None).unwrap();
        assert_eq!(branches.current.as_deref(), Some("main"));
        assert_eq!(branches.default_branch.as_deref(), Some("main"));
        assert_eq!(branches.local.len(), 2);
        let second = branches
            .local
            .iter()
            .find(|branch| branch.name == "ikinci")
            .unwrap();
        assert!(!second.current);
        assert!(second.worktree.is_some(), "the linked worktree holds it");
        // Without an upstream there is nothing to compare against.
        assert_eq!(second.ahead, None);
        assert_eq!(second.behind, None);

        // The linked worktree is its own repository root and shares the common dir.
        let repository = found(&linked);
        assert!(repository.linked_worktree);
        assert_ne!(repository.git_dir, repository.common_dir);
    }

    #[test]
    fn staging_all_includes_deletions_and_unstaging_keeps_working_bytes() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("kalan.txt"), b"keep\n").unwrap();
        fs::write(temp.path().join("gidecek.txt"), b"drop\n").unwrap();
        commit(temp.path(), "one");

        fs::remove_file(temp.path().join("gidecek.txt")).unwrap();
        fs::write(temp.path().join("kalan.txt"), b"edited\n").unwrap();
        let service = GitService::open(temp.path()).unwrap();
        let status = service.stage_all().unwrap();
        assert!(status
            .staged
            .iter()
            .any(|change| change.state == "deleted" && change.path == "gidecek.txt"));
        // Independent confirmation: the index no longer lists the deleted path.
        assert!(!git(temp.path(), &["ls-files", "--cached"]).contains("gidecek.txt"));

        let status = service.unstage(&["kalan.txt".to_string()]).unwrap();
        assert!(status
            .staged
            .iter()
            .all(|change| change.path != "kalan.txt"));
        // Unstaging must never touch the file on disk.
        assert_eq!(
            fs::read(temp.path().join("kalan.txt")).unwrap(),
            b"edited\n"
        );
        assert_eq!(git(temp.path(), &["show", "HEAD:kalan.txt"]), "keep\n");
    }

    #[test]
    fn unstaging_works_before_the_first_commit() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("ilk.txt"), b"new\n").unwrap();
        let service = GitService::open(temp.path()).unwrap();
        service.stage_all().unwrap();
        assert!(git(temp.path(), &["ls-files", "--cached"]).contains("ilk.txt"));

        // There is no HEAD to reset against yet, so the entry is dropped from the index instead.
        let status = service.unstage(&["ilk.txt".to_string()]).unwrap();
        assert!(status.staged.is_empty());
        assert!(git(temp.path(), &["ls-files", "--cached"])
            .trim()
            .is_empty());
        assert_eq!(fs::read(temp.path().join("ilk.txt")).unwrap(), b"new\n");
    }

    #[test]
    fn a_commit_records_the_index_not_the_working_tree() {
        let temp = sandbox();
        repo(temp.path());
        let file = temp.path().join("içerik.txt");
        fs::write(&file, b"staged\n").unwrap();
        let service = GitService::open(temp.path()).unwrap();
        service.stage_all().unwrap();
        // The file changes again after staging and before committing.
        fs::write(&file, b"newer\n").unwrap();

        let commit = service.commit("ilk kayıt").unwrap();
        assert_eq!(commit.summary, "ilk kayıt");
        assert!(commit.parents.is_empty());
        // The commit holds what was staged; the working file keeps the later edit.
        assert_eq!(git(temp.path(), &["show", "HEAD:içerik.txt"]), "staged\n");
        assert_eq!(fs::read(&file).unwrap(), b"newer\n");
        assert_eq!(git(temp.path(), &["rev-parse", "HEAD"]).trim(), commit.oid);
    }

    #[test]
    fn a_commit_requires_a_message_and_staged_content() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        let service = GitService::open(temp.path()).unwrap();

        assert_eq!(service.commit("   ").unwrap_err().code, "INVALID_MESSAGE");
        // Nothing is staged yet, so there is nothing to record.
        assert_eq!(service.commit("boş").unwrap_err().code, "NOTHING_STAGED");
        // Neither refusal created a commit.
        assert_ne!(try_git(temp.path(), &["rev-parse", "HEAD"]).code, 0);
    }

    #[test]
    fn committing_a_conflicted_index_is_refused() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("c.txt"), b"base\n").unwrap();
        commit(temp.path(), "base");
        git(temp.path(), &["checkout", "--quiet", "-b", "yan"]);
        fs::write(temp.path().join("c.txt"), b"theirs\n").unwrap();
        commit(temp.path(), "theirs");
        git(temp.path(), &["checkout", "--quiet", "main"]);
        fs::write(temp.path().join("c.txt"), b"ours\n").unwrap();
        commit(temp.path(), "ours");
        let before = git(temp.path(), &["rev-parse", "HEAD"]).trim().to_string();
        assert_ne!(try_git(temp.path(), &["merge", "yan"]).code, 0);

        let error = GitService::open(temp.path())
            .unwrap()
            .commit("merge")
            .unwrap_err();
        assert_eq!(error.code, "CONFLICTED");
        // HEAD did not move.
        assert_eq!(git(temp.path(), &["rev-parse", "HEAD"]).trim(), before);
    }

    #[test]
    fn creating_a_branch_does_not_switch_to_it() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        commit(temp.path(), "one");
        let head_before = fs::read(temp.path().join(".git").join("HEAD")).unwrap();

        let service = GitService::open(temp.path()).unwrap();
        service.create_branch("özellik/giriş", None).unwrap();
        // HEAD is byte-identical, so the branch was created without a checkout.
        assert_eq!(
            fs::read(temp.path().join(".git").join("HEAD")).unwrap(),
            head_before
        );
        assert!(!git(temp.path(), &["show-ref", "refs/heads/özellik/giriş"])
            .trim()
            .is_empty());
        assert_eq!(
            service
                .create_branch("özellik/giriş", None)
                .unwrap_err()
                .code,
            "BRANCH_EXISTS"
        );
    }

    #[test]
    fn checkout_is_refused_while_the_worktree_is_dirty() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        commit(temp.path(), "one");
        git(temp.path(), &["branch", "hedef"]);
        fs::write(temp.path().join("a.txt"), b"dirty\n").unwrap();

        let service = GitService::open(temp.path()).unwrap();
        assert_eq!(
            service.checkout("hedef").unwrap_err().code,
            "DIRTY_WORKTREE"
        );
        // The branch did not change and the edit survived.
        assert_eq!(
            git(temp.path(), &["symbolic-ref", "--short", "HEAD"]).trim(),
            "main"
        );
        assert_eq!(fs::read(temp.path().join("a.txt")).unwrap(), b"dirty\n");

        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        let status = GitService::open(temp.path())
            .unwrap()
            .checkout("hedef")
            .unwrap();
        assert_eq!(status.branch.as_deref(), Some("hedef"));
        assert_eq!(
            git(temp.path(), &["symbolic-ref", "--short", "HEAD"]).trim(),
            "hedef"
        );
    }

    #[test]
    fn branch_deletion_protects_current_default_and_unmerged_branches() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        commit(temp.path(), "one");
        git(temp.path(), &["branch", "birleşmemiş"]);
        git(temp.path(), &["checkout", "--quiet", "birleşmemiş"]);
        fs::write(temp.path().join("b.txt"), b"2\n").unwrap();
        commit(temp.path(), "only here");
        git(temp.path(), &["checkout", "--quiet", "main"]);

        let service = GitService::open(temp.path()).unwrap();
        assert_eq!(
            service.delete_branch("main", None).unwrap_err().code,
            "CURRENT_BRANCH"
        );
        assert_eq!(
            service.delete_branch("birleşmemiş", None).unwrap_err().code,
            "UNMERGED_BRANCH"
        );
        assert_eq!(
            service.delete_branch("yok-böyle", None).unwrap_err().code,
            "BRANCH_NOT_FOUND"
        );
        // Every refusal left the ref in place.
        for name in ["main", "birleşmemiş"] {
            assert!(
                !git(temp.path(), &["show-ref", &format!("refs/heads/{name}")])
                    .trim()
                    .is_empty()
            );
        }

        // A merged branch is deletable, and the recorded default is protected even when merged.
        git(temp.path(), &["branch", "birleşmiş"]);
        assert_eq!(
            service
                .delete_branch("birleşmiş", Some("birleşmiş"))
                .unwrap_err()
                .code,
            "PROTECTED_BRANCH"
        );
        service.delete_branch("birleşmiş", None).unwrap();
        assert_eq!(
            try_git(temp.path(), &["show-ref", "refs/heads/birleşmiş"]).code,
            1
        );
    }

    #[test]
    fn history_paginates_and_is_empty_on_an_unborn_branch() {
        let temp = sandbox();
        repo(temp.path());
        let service = GitService::open(temp.path()).unwrap();
        let empty = service.history(0, 10, None).unwrap();
        assert!(empty.commits.is_empty() && !empty.has_more);

        for index in 0..5 {
            fs::write(temp.path().join("a.txt"), format!("{index}\n")).unwrap();
            commit(temp.path(), &format!("kayıt {index}"));
        }
        let service = GitService::open(temp.path()).unwrap();
        let first = service.history(0, 2, None).unwrap();
        assert_eq!(first.commits.len(), 2);
        assert!(first.has_more);
        assert_eq!(first.commits[0].summary, "kayıt 4");
        let last = service.history(4, 2, None).unwrap();
        assert_eq!(last.commits.len(), 1);
        assert!(!last.has_more);
        assert_eq!(last.commits[0].summary, "kayıt 0");
        // Independent confirmation of the total.
        assert_eq!(
            git(temp.path(), &["rev-list", "--count", "HEAD"]).trim(),
            "5"
        );
    }

    #[test]
    fn diffs_report_binary_files_renames_and_line_counts() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("metin.txt"), b"a\nb\n").unwrap();
        fs::write(temp.path().join("veri.bin"), [0u8, 1, 2, 0, 3]).unwrap();
        commit(temp.path(), "one");

        fs::write(temp.path().join("metin.txt"), b"a\nc\nd\n").unwrap();
        fs::write(temp.path().join("veri.bin"), [9u8, 9, 0, 9]).unwrap();

        let service = GitService::open(temp.path()).unwrap();
        let text_diff = service.diff("metin.txt", false).unwrap();
        assert!(!text_diff.binary && !text_diff.truncated);
        assert_eq!(text_diff.added, Some(2));
        assert_eq!(text_diff.removed, Some(1));
        assert!(text_diff.patch.contains("+c"), "{}", text_diff.patch);

        let binary_diff = service.diff("veri.bin", false).unwrap();
        assert!(binary_diff.binary);
        assert_eq!(binary_diff.added, None);
        assert_eq!(binary_diff.removed, None);
        assert!(binary_diff.patch.is_empty());

        // A staged rename reports both of its paths.
        git(temp.path(), &["checkout", "--", "."]);
        git(temp.path(), &["mv", "metin.txt", "taşınmış.txt"]);
        let renamed = GitService::open(temp.path())
            .unwrap()
            .diff_summary(true)
            .unwrap();
        let entry = renamed
            .iter()
            .find(|stat| stat.path == "taşınmış.txt")
            .expect("the renamed file");
        assert_eq!(entry.original_path.as_deref(), Some("metin.txt"));
    }

    #[test]
    fn an_external_diff_command_is_never_run() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"one\n").unwrap();
        commit(temp.path(), "one");
        fs::write(temp.path().join("a.txt"), b"two\n").unwrap();
        // A configured external diff would write this file and suppress the real patch.
        let sentinel = temp.path().join("external-ran.txt");
        let script = if cfg!(windows) {
            format!("cmd.exe /C echo ran > \"{}\"", sentinel.display())
        } else {
            format!("touch \"{}\"", sentinel.display())
        };
        git(
            temp.path(),
            &["config", "--local", "diff.external", &script],
        );

        let diff = GitService::open(temp.path())
            .unwrap()
            .diff("a.txt", false)
            .unwrap();
        assert!(diff.patch.contains("+two"), "{}", diff.patch);
        assert!(!sentinel.exists(), "the external diff command must not run");
    }

    #[test]
    fn invalid_paths_are_rejected_before_git_runs() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        commit(temp.path(), "one");
        let service = GitService::open(temp.path()).unwrap();

        for path in ["", "../kaçış.txt", "alt\\dosya.txt", "a/../../b"] {
            assert_eq!(
                service.stage(&[path.to_string()]).unwrap_err().code,
                "INVALID_PATH",
                "{path:?} should be rejected"
            );
        }
        assert_eq!(service.stage(&[]).unwrap_err().code, "INVALID_PATH");
        // Nothing reached the index.
        assert!(GitService::open(temp.path())
            .unwrap()
            .status()
            .unwrap()
            .staged
            .is_empty());
    }

    /// A Tauri command needs four edits in lockstep: the function, the invoke handler, the
    /// build-time manifest and the window capability. Missing the last two fails only at runtime
    /// in the packaged app, so the four lists are compared here instead. Every command is checked,
    /// not only this module's: the prefix filter this test used to carry read `github_account` as a
    /// Git command called `hub_account`.
    #[test]
    fn every_command_is_registered_in_all_four_places() {
        let commands = include_str!("../commands/mod.rs");
        let handler = include_str!("../lib.rs");
        let manifest = include_str!("../../build.rs");
        let capability = include_str!("../../capabilities/main.json");

        let names: Vec<&str> = commands
            .lines()
            .filter_map(|line| line.trim().strip_prefix("pub async fn "))
            .filter_map(|rest| rest.split('(').next())
            .collect();
        assert!(
            names.len() >= 46,
            "expected the whole command surface, found {} in {names:?}",
            names.len()
        );
        assert!(
            names.iter().any(|name| name.starts_with("git_")),
            "expected the Git commands among {names:?}"
        );
        assert!(
            names.iter().any(|name| name.starts_with("github_")),
            "expected the GitHub commands among {names:?}"
        );
        for name in names {
            let kebab = name.replace('_', "-");
            assert!(
                handler.contains(&format!("commands::{name},")),
                "{name} is missing from the invoke handler, or is its last entry and has no comma"
            );
            assert!(
                manifest.contains(&format!("\"{name}\",")),
                "{name} is missing from the build-time command list"
            );
            assert!(
                capability.contains(&format!("\"allow-{kebab}\"")),
                "{name} is missing from the main window capability"
            );
        }
    }

    /// Nothing in this module may reconfigure the machine. Credential helpers and SSH settings are
    /// read from the user's own configuration and never written.
    #[test]
    fn no_argument_list_writes_global_or_system_configuration() {
        let source = include_str!("mod.rs");
        // Comments explain why these settings are deliberately avoided, so only real code counts.
        let code: String = source
            .split("#[cfg(test)]")
            .next()
            .expect("the non-test source")
            .lines()
            .filter(|line| !line.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join(
                "
",
            );
        for forbidden in ["--global", "--system", "GIT_CONFIG_NOSYSTEM"] {
            assert!(
                !code.contains(forbidden),
                "{forbidden} must never appear in the Git service"
            );
        }
    }

    /// A bare remote and two clones of it, so fetch, pull, push and divergence are exercised
    /// against real Git without needing a network.
    fn shared() -> (tempfile::TempDir, PathBuf, PathBuf, PathBuf) {
        let temp = sandbox();
        let seed = temp.path().join("kaynak depo");
        fs::create_dir(&seed).unwrap();
        repo(&seed);
        fs::write(seed.join("ortak.txt"), b"base\n").unwrap();
        commit(&seed, "base");

        let bare = temp.path().join("uzak depo.git");
        git(
            temp.path(),
            &[
                "clone",
                "--bare",
                "--quiet",
                "--",
                seed.to_str().unwrap(),
                bare.to_str().unwrap(),
            ],
        );
        let mut clones = Vec::new();
        for name in ["klon bir", "klon iki"] {
            let path = temp.path().join(name);
            git(
                temp.path(),
                &[
                    // Set before checkout: applying it afterwards would leave every file looking
                    // modified. Production deliberately respects whatever the user configured.
                    "-c",
                    "core.autocrlf=false",
                    "clone",
                    "--quiet",
                    "--",
                    bare.to_str().unwrap(),
                    path.to_str().unwrap(),
                ],
            );
            for (key, value) in [
                ("user.name", "TBCE Test"),
                ("user.email", "tbce@example.invalid"),
                ("commit.gpgsign", "false"),
                ("core.autocrlf", "false"),
            ] {
                git(&path, &["config", "--local", key, value]);
            }
            clones.push(path);
        }
        (temp, bare, clones.remove(0), clones.remove(0))
    }

    #[test]
    fn push_and_pull_move_commits_between_two_clones() {
        let (_temp, bare, first, second) = shared();
        fs::write(first.join("ortak.txt"), b"from first\n").unwrap();
        commit(&first, "first change");

        let status = GitService::open(&first).unwrap().status().unwrap();
        assert_eq!(status.ahead, Some(1));
        assert_eq!(status.behind, Some(0));
        assert_eq!(status.upstream.as_deref(), Some("origin/main"));

        let pushed = GitService::open(&first).unwrap().push(false).unwrap();
        assert_eq!(pushed.ahead, Some(0));
        // Independent confirmation: the bare remote actually advanced.
        assert_eq!(
            git(&bare, &["rev-parse", "refs/heads/main"]).trim(),
            git(&first, &["rev-parse", "HEAD"]).trim()
        );

        let fetched = GitService::open(&second).unwrap().fetch(None).unwrap();
        assert_eq!(fetched.behind, Some(1));
        assert_eq!(fetched.ahead, Some(0));
        let pulled = GitService::open(&second).unwrap().pull().unwrap();
        assert_eq!(pulled.behind, Some(0));
        // The file on disk carries the other clone's content.
        assert_eq!(fs::read(second.join("ortak.txt")).unwrap(), b"from first\n");
    }

    #[test]
    fn divergence_is_reported_and_never_forced() {
        let (_temp, bare, first, second) = shared();
        fs::write(first.join("ortak.txt"), b"first\n").unwrap();
        commit(&first, "first");
        GitService::open(&first).unwrap().push(false).unwrap();
        let remote_tip = git(&bare, &["rev-parse", "refs/heads/main"])
            .trim()
            .to_string();

        // The second clone commits on top of the old tip, so the two histories diverge.
        fs::write(second.join("ortak.txt"), b"second\n").unwrap();
        commit(&second, "second");
        GitService::open(&second).unwrap().fetch(None).unwrap();
        let status = GitService::open(&second).unwrap().status().unwrap();
        assert_eq!(status.ahead, Some(1));
        assert_eq!(status.behind, Some(1));

        assert_eq!(
            GitService::open(&second).unwrap().pull().unwrap_err().code,
            "DIVERGED"
        );
        assert_eq!(
            GitService::open(&second)
                .unwrap()
                .push(false)
                .unwrap_err()
                .code,
            "PUSH_REJECTED"
        );
        // Neither refusal changed the remote or the local working file.
        assert_eq!(
            git(&bare, &["rev-parse", "refs/heads/main"]).trim(),
            remote_tip
        );
        assert_eq!(fs::read(second.join("ortak.txt")).unwrap(), b"second\n");
    }

    #[test]
    fn pulling_is_refused_without_an_upstream_or_with_local_changes() {
        let (_temp, _bare, first, _second) = shared();
        git(&first, &["checkout", "--quiet", "-b", "yerel-dal"]);
        assert_eq!(
            GitService::open(&first).unwrap().pull().unwrap_err().code,
            "NO_UPSTREAM"
        );

        git(&first, &["checkout", "--quiet", "main"]);
        fs::write(first.join("ortak.txt"), b"dirty\n").unwrap();
        assert_eq!(
            GitService::open(&first).unwrap().pull().unwrap_err().code,
            "DIRTY_WORKTREE"
        );
        assert_eq!(fs::read(first.join("ortak.txt")).unwrap(), b"dirty\n");
    }

    #[test]
    fn a_repository_without_a_remote_reports_no_remote() {
        let temp = sandbox();
        repo(temp.path());
        fs::write(temp.path().join("a.txt"), b"1\n").unwrap();
        commit(temp.path(), "one");
        assert_eq!(
            GitService::open(temp.path())
                .unwrap()
                .fetch(None)
                .unwrap_err()
                .code,
            "NO_REMOTE"
        );
    }

    #[test]
    fn executable_transport_sources_are_refused() {
        let temp = sandbox();
        let sentinel = temp.path().join("pwn.txt");
        let helper = format!("ext::sh -c touch% {}", sentinel.display());
        for source in [
            helper.as_str(),
            "ext::sh -c whoami",
            "fd::7/repo",
            "git://host/repo.git",
            "http://host/repo.git",
            "--upload-pack=touch",
            "",
        ] {
            assert_eq!(
                validate_remote(source).unwrap_err().code,
                "UNSUPPORTED_REMOTE",
                "{source:?} should be refused"
            );
        }
        // The refusal happens before any process starts, so nothing was created.
        assert!(!sentinel.exists());
        assert_eq!(
            clone(&helper, temp.path(), "hedef").unwrap_err().code,
            "UNSUPPORTED_REMOTE"
        );
        assert!(!temp.path().join("hedef").exists());

        for source in [
            "https://github.com/owner/repo.git",
            "ssh://git@github.com/owner/repo.git",
            "git@github.com:owner/repo.git",
        ] {
            assert!(
                validate_remote(source).is_ok(),
                "{source:?} should be accepted"
            );
        }
    }

    #[test]
    fn cloning_creates_a_new_folder_and_leaves_an_existing_one_untouched() {
        let (temp, bare, _first, _second) = shared();
        let parent = temp.path().join("hedef klasör");
        fs::create_dir(&parent).unwrap();

        let outcome = clone(bare.to_str().unwrap(), &parent, "yeni klon").unwrap();
        assert_eq!(outcome.name, "yeni klon");
        assert_eq!(outcome.default_branch.as_deref(), Some("main"));
        // Line endings follow whatever core.autocrlf is configured on this machine, which
        // production deliberately respects, so content is compared rather than exact bytes.
        assert_eq!(
            fs::read_to_string(parent.join("yeni klon").join("ortak.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "base\n"
        );

        // An existing destination is refused, and its contents survive untouched.
        let occupied = parent.join("dolu");
        fs::create_dir(&occupied).unwrap();
        fs::write(occupied.join("önemli.txt"), b"untouched").unwrap();
        assert_eq!(
            clone(bare.to_str().unwrap(), &parent, "dolu")
                .unwrap_err()
                .code,
            "CLONE_TARGET_EXISTS"
        );
        assert_eq!(fs::read(occupied.join("önemli.txt")).unwrap(), b"untouched");

        // A failed clone removes only the directory this call created.
        let missing = temp.path().join("yok olan.git");
        assert!(clone(missing.to_str().unwrap(), &parent, "başarısız").is_err());
        assert!(!parent.join("başarısız").exists());
    }

    #[test]
    fn credentials_never_reach_a_message() {
        assert_eq!(
            redact("fatal: could not read from https://user:ghp_secret@github.com/o/r.git"),
            "fatal: could not read from https://user:***@github.com/o/r.git"
        );
        // A bare token with no user name is removed entirely.
        assert_eq!(redact("https://ghp_tok@host/r"), "https://***@host/r");
        // Text without credentials is returned unchanged.
        assert_eq!(
            redact("https://github.com/o/r.git"),
            "https://github.com/o/r.git"
        );
        assert_eq!(redact("no url here"), "no url here");
    }

    #[test]
    fn invalid_branch_names_are_rejected_before_git_runs() {
        for name in [
            "",
            " ",
            "-force",
            "HEAD",
            "with space",
            "a..b",
            "a@{0}",
            "tip.lock",
            "dal/",
            "a~b",
            "a^b",
            "a:b",
            "a?b",
            "a*b",
            "a[b",
            "a\\b",
        ] {
            assert_eq!(
                validate_branch_name(name).unwrap_err().code,
                "INVALID_BRANCH_NAME",
                "{name:?} should be rejected"
            );
        }
        for name in ["main", "feature/auth", "düzeltme-1", "v1.2"] {
            assert!(
                validate_branch_name(name).is_ok(),
                "{name:?} should be accepted"
            );
        }
    }

    #[test]
    fn a_failed_invocation_is_classified_by_its_message() {
        let table: Table = &[("authentication failed", "AUTH_FAILED")];
        let error = classify(
            "fatal: Authentication failed for 'https://u:tok@h/r'",
            table,
        );
        assert_eq!(error.code, "AUTH_FAILED");
        assert!(!error.message.contains("tok"), "{}", error.message);
        // An unrecognized failure stays a generic Git failure rather than being guessed at.
        assert_eq!(classify("fatal: something else", table).code, "GIT_FAILED");
        assert_eq!(
            classify("fatal: something else", table).message,
            "something else"
        );
    }
}
