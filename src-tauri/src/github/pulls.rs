//! GitHub pull requests: listing, reading one with its checks, and its changed files. Nothing here
//! writes: every request is a `GET`, and creating, reviewing and merging stay with a later milestone.
//! The models stay GitHub's own and are not shared with the rest of TBCE.

use super::issues::{Label, LabelBody, MilestoneBody, MilestoneReference};
use super::{
    clamp, parse, segment, GitHubService, OwnerBody, Page, RateLimit, LIST_PAGE_CAP, PER_PAGE,
};
use crate::filesystem::{Result, ServiceError};
use serde::{Deserialize, Serialize};

/// Check runs and commit statuses are read a hundred at a time, once. More than that is reported as
/// truncated rather than paged, because the summary is what the panel is for.
const CHECK_PAGE: u32 = 100;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PullState {
    Open,
    Closed,
}

impl PullState {
    fn name(self) -> &'static str {
        match self {
            PullState::Open => "open",
            PullState::Closed => "closed",
        }
    }
}

/// Where a pull request comes from.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullHead {
    pub reference: String,
    /// `owner:branch`, as GitHub labels it.
    pub label: Option<String>,
    pub sha: String,
    /// The repository the branch lives in, or nothing when that fork has been deleted.
    pub repository: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullBase {
    pub reference: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub state: PullState,
    pub draft: bool,
    /// GitHub reports a merged pull request as closed, so this is what tells the two apart.
    pub merged: bool,
    pub author: Option<String>,
    pub head: PullHead,
    pub base: PullBase,
    /// The branch lives in another repository than the one it targets, or in a deleted fork.
    pub cross_repository: bool,
    pub labels: Vec<Label>,
    pub assignees: Vec<String>,
    /// Requested reviewers: logins, then team names.
    pub reviewers: Vec<String>,
    pub milestone: Option<MilestoneReference>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
}

/// How one check, or all of them together, turned out.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Passing,
    Failing,
    Pending,
    /// Skipped, neutral or stale: finished without passing or failing anything.
    Neutral,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CheckSource {
    /// The Checks API, which GitHub Actions and most current integrations use.
    Run,
    /// A commit status, which older and external CI services still report through.
    Status,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub name: String,
    pub source: CheckSource,
    pub outcome: Outcome,
    /// GitHub's own word for where it stands: a conclusion, a run status or a status state.
    pub state: String,
    /// A status's description or the app that ran a check.
    pub description: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Summary {
    Passing,
    Failing,
    Pending,
    #[default]
    None,
}

/// The CI state of the head commit. A refusal or failure here is part of the answer rather than a
/// failed read, because the pull request itself was read fine.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Checks {
    pub summary: Summary,
    pub entries: Vec<Check>,
    /// GitHub reported more runs or statuses than were read.
    pub truncated: bool,
    pub runs_denied: bool,
    pub statuses_denied: bool,
    /// GitHub does not have the commit, which for a local commit usually means it is not pushed.
    pub missing: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDetail {
    #[serde(flatten)]
    pub pull: PullRequest,
    /// Text for the panel to show as written, never markup.
    pub body: Option<String>,
    pub commits: Option<u64>,
    pub additions: Option<u64>,
    pub deletions: Option<u64>,
    pub changed_files: Option<u64>,
    pub comments: Option<u64>,
    pub review_comments: Option<u64>,
    /// Nothing until GitHub has worked it out, which it does in the background.
    pub mergeable: Option<bool>,
    pub mergeable_state: Option<String>,
    pub checks: Checks,
    pub rate: Option<RateLimit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullFile {
    pub path: String,
    pub previous_path: Option<String>,
    /// `added`, `removed`, `modified`, `renamed`, `copied`, `changed` or `unchanged`.
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    /// GitHub leaves the patch out for binary files and for very large ones.
    pub patch: Option<String>,
}

#[derive(Deserialize)]
struct PullBody {
    number: u64,
    title: String,
    state: PullState,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    user: Option<OwnerBody>,
    head: HeadBody,
    base: BaseBody,
    #[serde(default)]
    labels: Vec<LabelBody>,
    #[serde(default)]
    assignees: Vec<OwnerBody>,
    #[serde(default)]
    requested_reviewers: Vec<OwnerBody>,
    #[serde(default)]
    requested_teams: Vec<TeamBody>,
    #[serde(default)]
    milestone: Option<MilestoneBody>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    #[serde(default)]
    merged_at: Option<String>,
    #[serde(default)]
    body: Option<String>,
    // Present on a single pull request only.
    #[serde(default)]
    merged: Option<bool>,
    #[serde(default)]
    mergeable: Option<bool>,
    #[serde(default)]
    mergeable_state: Option<String>,
    #[serde(default)]
    commits: Option<u64>,
    #[serde(default)]
    additions: Option<u64>,
    #[serde(default)]
    deletions: Option<u64>,
    #[serde(default)]
    changed_files: Option<u64>,
    #[serde(default)]
    comments: Option<u64>,
    #[serde(default)]
    review_comments: Option<u64>,
}

#[derive(Deserialize)]
struct HeadBody {
    #[serde(rename = "ref")]
    reference: String,
    #[serde(default)]
    label: Option<String>,
    sha: String,
    #[serde(default)]
    repo: Option<RepoBody>,
}

#[derive(Deserialize)]
struct BaseBody {
    #[serde(rename = "ref")]
    reference: String,
    #[serde(default)]
    repo: Option<RepoBody>,
}

#[derive(Deserialize)]
struct RepoBody {
    full_name: String,
}

#[derive(Deserialize)]
struct TeamBody {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    slug: Option<String>,
}

#[derive(Deserialize)]
struct FileBody {
    filename: String,
    #[serde(default)]
    previous_filename: Option<String>,
    #[serde(default)]
    status: String,
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
    #[serde(default)]
    patch: Option<String>,
}

#[derive(Deserialize)]
struct RunsBody {
    #[serde(default)]
    total_count: usize,
    #[serde(default)]
    check_runs: Vec<RunBody>,
}

#[derive(Deserialize)]
struct RunBody {
    name: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    app: Option<AppBody>,
}

#[derive(Deserialize)]
struct AppBody {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct StatusesBody {
    #[serde(default)]
    total_count: usize,
    #[serde(default)]
    statuses: Vec<StatusBody>,
}

#[derive(Deserialize)]
struct StatusBody {
    #[serde(default)]
    context: Option<String>,
    state: String,
    #[serde(default)]
    description: Option<String>,
}

impl PullBody {
    fn summary(self) -> (PullRequest, Extra) {
        let head_repository = self.head.repo.map(|repo| repo.full_name);
        let base_repository = self.base.repo.map(|repo| repo.full_name);
        let cross_repository = match (&head_repository, &base_repository) {
            (Some(head), Some(base)) => !head.eq_ignore_ascii_case(base),
            // GitHub drops the head repository when the fork it came from is deleted.
            (None, _) => true,
            (Some(_), None) => false,
        };
        let mut reviewers: Vec<String> = self
            .requested_reviewers
            .into_iter()
            .map(|user| user.login)
            .collect();
        reviewers.extend(
            self.requested_teams
                .into_iter()
                .filter_map(|team| team.name.or(team.slug)),
        );
        let pull = PullRequest {
            number: self.number,
            title: self.title,
            state: self.state,
            draft: self.draft,
            merged: self.merged.unwrap_or(false) || self.merged_at.is_some(),
            author: self.user.map(|user| user.login),
            head: PullHead {
                reference: self.head.reference,
                label: self.head.label,
                sha: self.head.sha,
                repository: head_repository,
            },
            base: PullBase {
                reference: self.base.reference,
            },
            cross_repository,
            labels: self.labels.into_iter().map(LabelBody::label).collect(),
            assignees: self.assignees.into_iter().map(|user| user.login).collect(),
            reviewers,
            milestone: self.milestone.map(MilestoneBody::reference),
            created_at: self.created_at,
            updated_at: self.updated_at,
            closed_at: self.closed_at,
            merged_at: self.merged_at,
        };
        let extra = Extra {
            body: self.body,
            commits: self.commits,
            additions: self.additions,
            deletions: self.deletions,
            changed_files: self.changed_files,
            comments: self.comments,
            review_comments: self.review_comments,
            mergeable: self.mergeable,
            mergeable_state: self.mergeable_state,
        };
        (pull, extra)
    }
}

/// What only a single pull request carries.
struct Extra {
    body: Option<String>,
    commits: Option<u64>,
    additions: Option<u64>,
    deletions: Option<u64>,
    changed_files: Option<u64>,
    comments: Option<u64>,
    review_comments: Option<u64>,
    mergeable: Option<bool>,
    mergeable_state: Option<String>,
}

impl GitHubService {
    /// One page of pull requests, newest first as GitHub orders them.
    pub fn pull_requests(
        &mut self,
        owner: &str,
        repo: &str,
        state: PullState,
        page: u32,
    ) -> Result<Page<PullRequest>> {
        let page = clamp(page);
        let path = format!(
            "/repos/{}/{}/pulls?state={}&per_page={PER_PAGE}&page={page}",
            segment(owner)?,
            segment(repo)?,
            state.name()
        );
        let answer = self.get_capped(&path, LIST_PAGE_CAP)?;
        let bodies: Vec<PullBody> = parse(&answer.body)?;
        Ok(Page {
            items: bodies.into_iter().map(|body| body.summary().0).collect(),
            page,
            has_more: answer.has_more,
            rate: answer.rate,
        })
    }

    /// One pull request with its description, its counts and the CI state of its head commit.
    pub fn pull_request(
        &mut self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<PullRequestDetail> {
        validate_number(number)?;
        let base = format!("/repos/{}/{}", segment(owner)?, segment(repo)?);
        let answer = self
            .get(&format!("{base}/pulls/{number}"))
            .map_err(|error| missing(error, number))?;
        let body: PullBody = parse(&answer.body)?;
        let (pull, extra) = body.summary();
        let (checks, checked) = self.checks(&base, &pull.head.sha)?;
        Ok(PullRequestDetail {
            pull,
            body: extra.body,
            commits: extra.commits,
            additions: extra.additions,
            deletions: extra.deletions,
            changed_files: extra.changed_files,
            comments: extra.comments,
            review_comments: extra.review_comments,
            mergeable: extra.mergeable,
            mergeable_state: extra.mergeable_state,
            checks,
            rate: checked.or(answer.rate),
        })
    }

    /// One page of the files a pull request changes, each with GitHub's patch when it sent one.
    pub fn pull_files(
        &mut self,
        owner: &str,
        repo: &str,
        number: u64,
        page: u32,
    ) -> Result<Page<PullFile>> {
        validate_number(number)?;
        let page = clamp(page);
        let path = format!(
            "/repos/{}/{}/pulls/{number}/files?per_page={PER_PAGE}&page={page}",
            segment(owner)?,
            segment(repo)?
        );
        let answer = self
            .get_capped(&path, LIST_PAGE_CAP)
            .map_err(|error| missing(error, number))?;
        let bodies: Vec<FileBody> = parse(&answer.body)?;
        Ok(Page {
            items: bodies
                .into_iter()
                .map(|body| PullFile {
                    path: body.filename,
                    previous_path: body.previous_filename,
                    status: body.status,
                    additions: body.additions,
                    deletions: body.deletions,
                    patch: body.patch,
                })
                .collect(),
            page,
            has_more: answer.has_more,
            rate: answer.rate,
        })
    }

    /// Check runs and commit statuses for one commit. Only a rejected token stops the pull request
    /// or the dashboard from being shown; anything else is recorded in the answer. A commit GitHub
    /// does not have costs one request, because its statuses cannot exist either.
    pub(super) fn checks(&mut self, base: &str, sha: &str) -> Result<(Checks, Option<RateLimit>)> {
        let mut checks = Checks::default();
        let mut rate = None;
        if !is_sha(sha) {
            checks.error = Some("GitHub reported a head commit TBCE cannot use.".into());
            return Ok((checks, rate));
        }
        let runs = self.get(&format!(
            "{base}/commits/{sha}/check-runs?per_page={CHECK_PAGE}"
        ));
        match runs.and_then(|answer| Ok((parse::<RunsBody>(&answer.body)?, answer.rate))) {
            Ok((body, answered)) => {
                rate = answered.or(rate);
                checks.truncated |= body.total_count > body.check_runs.len();
                checks
                    .entries
                    .extend(body.check_runs.into_iter().map(run_check));
            }
            Err(error) => record(&mut checks, error, |checks| checks.runs_denied = true)?,
        }
        if checks.missing {
            return Ok((checks, rate));
        }
        let statuses = self.get(&format!(
            "{base}/commits/{sha}/status?per_page={CHECK_PAGE}"
        ));
        match statuses.and_then(|answer| Ok((parse::<StatusesBody>(&answer.body)?, answer.rate))) {
            Ok((body, answered)) => {
                rate = answered.or(rate);
                checks.truncated |= body.total_count > body.statuses.len();
                checks
                    .entries
                    .extend(body.statuses.into_iter().map(status_check));
            }
            Err(error) => record(&mut checks, error, |checks| checks.statuses_denied = true)?,
        }
        checks.summary = summarize(&checks.entries);
        Ok((checks, rate))
    }
}

/// A failed checks read becomes part of the answer, except a rejected token, which must still
/// reach the panel so it offers to connect again.
fn record(
    checks: &mut Checks,
    error: ServiceError,
    denied: impl FnOnce(&mut Checks),
) -> Result<()> {
    match error.code {
        "GITHUB_AUTH_FAILED" | "GITHUB_SIGNED_OUT" => Err(error),
        "GITHUB_FORBIDDEN" => {
            denied(checks);
            Ok(())
        }
        // GitHub answers 422 for a commit it has never seen, and 404 where it cannot see it.
        "GITHUB_NOT_FOUND" | "GITHUB_VALIDATION_FAILED" => {
            checks.missing = true;
            add_error(
                checks,
                "GitHub could not find the commit to read its checks.",
            );
            Ok(())
        }
        _ => {
            add_error(checks, &error.message);
            Ok(())
        }
    }
}

fn add_error(checks: &mut Checks, message: &str) {
    checks.error = Some(match checks.error.take() {
        Some(earlier) if earlier != message => format!("{earlier} {message}"),
        Some(earlier) => earlier,
        None => message.to_string(),
    });
}

fn run_check(run: RunBody) -> Check {
    let status = run.status.unwrap_or_else(|| "completed".into());
    let (outcome, state) = if status != "completed" {
        (Outcome::Pending, status)
    } else {
        let conclusion = run.conclusion.unwrap_or_else(|| "neutral".into());
        let outcome = match conclusion.as_str() {
            "success" => Outcome::Passing,
            "failure" | "timed_out" | "cancelled" | "startup_failure" | "action_required" => {
                Outcome::Failing
            }
            _ => Outcome::Neutral,
        };
        (outcome, conclusion)
    };
    Check {
        name: run.name,
        source: CheckSource::Run,
        outcome,
        state,
        description: run
            .app
            .and_then(|app| app.name)
            .filter(|name| !name.is_empty()),
    }
}

fn status_check(status: StatusBody) -> Check {
    let outcome = match status.state.as_str() {
        "success" => Outcome::Passing,
        "failure" | "error" => Outcome::Failing,
        "pending" => Outcome::Pending,
        _ => Outcome::Neutral,
    };
    Check {
        name: status.context.unwrap_or_else(|| "status".into()),
        source: CheckSource::Status,
        outcome,
        state: status.state,
        description: status.description.filter(|text| !text.is_empty()),
    }
}

/// Failing wins over pending, and pending over passing. Neutral entries neither pass nor fail, so a
/// commit whose checks were all skipped still reads as passing rather than as having none.
fn summarize(entries: &[Check]) -> Summary {
    if entries.is_empty() {
        Summary::None
    } else if entries
        .iter()
        .any(|check| check.outcome == Outcome::Failing)
    {
        Summary::Failing
    } else if entries
        .iter()
        .any(|check| check.outcome == Outcome::Pending)
    {
        Summary::Pending
    } else {
        Summary::Passing
    }
}

/// A commit identifier as GitHub reports one: SHA-1 or SHA-256, in hexadecimal. It goes into a
/// request path, so nothing else is accepted even though it came from GitHub.
fn is_sha(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.chars().all(|c| c.is_ascii_hexdigit())
}

fn validate_number(number: u64) -> Result<()> {
    if number == 0 {
        return Err(ServiceError::new(
            "GITHUB_INVALID_PULL",
            "That pull request number cannot be used.",
        ));
    }
    Ok(())
}

fn missing(error: ServiceError, number: u64) -> ServiceError {
    match error.code {
        "GITHUB_NOT_FOUND" => ServiceError::new(
            "GITHUB_NOT_FOUND",
            format!("GitHub has no pull request #{number} here, or this token cannot see it."),
        ),
        _ => error,
    }
}

#[cfg(test)]
mod tests {
    use super::super::mock::*;
    use super::super::{BODY_CAP, PER_PAGE};
    use super::*;
    use serde_json::{json, Value};

    const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

    /// A pull request as GitHub serializes one, with `extra` merged over the defaults.
    fn pull(number: u64, extra: Value) -> Value {
        let mut pull = json!({
            "number": number,
            "title": format!("Pull request {number}"),
            "state": "open",
            "draft": false,
            "user": { "login": "octocat" },
            "head": {
                "ref": "feature/auth",
                "label": "MYY-sudo:feature/auth",
                "sha": SHA,
                "repo": { "full_name": "MYY-sudo/TBCE" }
            },
            "base": {
                "ref": "main",
                "sha": "f".repeat(40),
                "repo": { "full_name": "MYY-sudo/TBCE" }
            },
            "labels": [],
            "assignees": [],
            "requested_reviewers": [],
            "requested_teams": [],
            "milestone": null,
            "created_at": "2026-09-18T10:00:00Z",
            "merged_at": null,
            "body": "body",
        });
        for (key, value) in extra.as_object().expect("an object") {
            pull[key] = value.clone();
        }
        pull
    }

    fn runs(entries: Value) -> String {
        let count = entries.as_array().map_or(0, Vec::len);
        json!({ "total_count": count, "check_runs": entries }).to_string()
    }

    fn statuses(entries: Value) -> String {
        let count = entries.as_array().map_or(0, Vec::len);
        json!({ "state": "pending", "total_count": count, "statuses": entries }).to_string()
    }

    /// A pull request answer followed by the two checks answers.
    fn detail_stubs(pull: Value, runs: Stub, statuses: Stub) -> Vec<Stub> {
        vec![Stub::ok(&pull.to_string()), runs, statuses]
    }

    fn read(stubs: Vec<Stub>) -> (PullRequestDetail, Server) {
        let server = serve(stubs);
        let (mut service, _) = signed_in(&server);
        let detail = service.pull_request("MYY-sudo", "TBCE", 7).unwrap();
        (detail, server)
    }

    #[test]
    fn the_list_carries_branches_state_and_people_and_pages_from_the_link_header() {
        let page = json!([
            pull(
                9,
                json!({
                    "draft": true,
                    "labels": [{ "name": "ui", "color": "A2EEEF" }],
                    "assignees": [{ "login": "oyku" }],
                    "requested_reviewers": [{ "login": "reviewer" }],
                    "requested_teams": [{ "name": "Core", "slug": "core" }],
                    "milestone": { "number": 3, "title": "V1" }
                })
            ),
            pull(
                8,
                json!({
                    "head": {
                        "ref": "patch-1",
                        "label": "someone:patch-1",
                        "sha": SHA,
                        "repo": { "full_name": "someone/TBCE" }
                    }
                })
            ),
            pull(
                7,
                json!({
                    "head": { "ref": "gone", "label": "unknown:gone", "sha": SHA, "repo": null }
                })
            ),
        ]);
        let server = serve(vec![
            Stub::ok(&page.to_string())
                .header("Link", "<http://example.invalid/?page=2>; rel=\"next\""),
            Stub::ok("[]"),
        ]);
        let (mut service, _) = signed_in(&server);

        let first = service
            .pull_requests("MYY-sudo", "TBCE", PullState::Open, 1)
            .unwrap();
        let second = service
            .pull_requests("MYY-sudo", "TBCE", PullState::Open, 2)
            .unwrap();

        assert_eq!(
            server.path(0),
            format!("/repos/MYY-sudo/TBCE/pulls?state=open&per_page={PER_PAGE}&page=1")
        );
        assert!(first.has_more);
        assert!(!second.has_more);
        let [draft, fork, deleted] = &first.items[..] else {
            panic!("three pull requests expected");
        };
        assert!(draft.draft);
        assert_eq!(draft.head.reference, "feature/auth");
        assert_eq!(draft.base.reference, "main");
        assert!(!draft.cross_repository);
        assert_eq!(draft.labels[0].color.as_deref(), Some("a2eeef"));
        assert_eq!(draft.assignees, vec!["oyku"]);
        assert_eq!(draft.reviewers, vec!["reviewer", "Core"]);
        assert_eq!(draft.milestone.as_ref().map(|m| m.number), Some(3));
        assert!(fork.cross_repository);
        assert_eq!(fork.head.repository.as_deref(), Some("someone/TBCE"));
        assert!(deleted.cross_repository, "a deleted fork read as local");
        assert_eq!(deleted.head.repository, None);
    }

    #[test]
    fn a_merged_pull_request_is_told_apart_from_one_closed_without_merging() {
        let page = json!([
            pull(
                5,
                json!({ "state": "closed", "merged_at": "2026-09-18T12:00:00Z",
                        "closed_at": "2026-09-18T12:00:00Z" })
            ),
            pull(
                4,
                json!({ "state": "closed", "closed_at": "2026-09-18T11:00:00Z" })
            ),
        ]);
        let server = serve(vec![Stub::ok(&page.to_string())]);
        let (mut service, _) = signed_in(&server);

        let page = service
            .pull_requests("MYY-sudo", "TBCE", PullState::Closed, 1)
            .unwrap();

        assert!(server.path(0).contains("state=closed"));
        assert!(page.items[0].merged);
        assert_eq!(page.items[0].state, PullState::Closed);
        assert!(!page.items[1].merged);
    }

    #[test]
    fn a_pull_request_is_read_with_its_counts_body_and_the_checks_of_its_head() {
        let body = "Özet:\n<script>alert(1)</script>\n- madde";
        let (detail, server) = read(detail_stubs(
            pull(
                7,
                json!({
                    "body": body,
                    "merged": false,
                    "mergeable": null,
                    "mergeable_state": "unknown",
                    "commits": 3,
                    "additions": 120,
                    "deletions": 8,
                    "changed_files": 4,
                    "comments": 2,
                    "review_comments": 5
                }),
            ),
            Stub::ok(&runs(json!([]))),
            Stub::ok(&statuses(json!([]))),
        ));

        assert_eq!(server.path(0), "/repos/MYY-sudo/TBCE/pulls/7");
        assert_eq!(
            server.path(1),
            format!("/repos/MYY-sudo/TBCE/commits/{SHA}/check-runs?per_page={CHECK_PAGE}")
        );
        assert_eq!(
            server.path(2),
            format!("/repos/MYY-sudo/TBCE/commits/{SHA}/status?per_page={CHECK_PAGE}")
        );
        assert_eq!(detail.body.as_deref(), Some(body));
        assert_eq!(detail.commits, Some(3));
        assert_eq!(detail.additions, Some(120));
        assert_eq!(detail.deletions, Some(8));
        assert_eq!(detail.changed_files, Some(4));
        assert_eq!(detail.review_comments, Some(5));
        assert_eq!(
            detail.mergeable, None,
            "an uncomputed merge state was guessed"
        );
        assert_eq!(detail.checks.summary, Summary::None);
        assert!(detail.checks.error.is_none());
    }

    #[test]
    fn runs_and_statuses_are_summarized_together() {
        let run = |name: &str, status: &str, conclusion: Value| {
            json!({ "name": name, "status": status, "conclusion": conclusion,
                    "app": { "name": "GitHub Actions" } })
        };
        let status = |context: &str, state: &str| json!({ "context": context, "state": state });
        let cases = [
            (
                json!([
                    run("build", "completed", json!("success")),
                    run("docs", "completed", json!("skipped"))
                ]),
                json!([status("ci/legacy", "success")]),
                Summary::Passing,
            ),
            (
                json!([
                    run("build", "completed", json!("success")),
                    run("test", "in_progress", Value::Null)
                ]),
                json!([]),
                Summary::Pending,
            ),
            (
                json!([run("build", "completed", json!("success"))]),
                json!([status("ci/legacy", "pending")]),
                Summary::Pending,
            ),
            (
                json!([run("build", "queued", Value::Null)]),
                json!([status("ci/legacy", "error")]),
                Summary::Failing,
            ),
            (
                json!([run("lint", "completed", json!("timed_out"))]),
                json!([]),
                Summary::Failing,
            ),
            (
                json!([run("docs", "completed", json!("skipped"))]),
                json!([]),
                Summary::Passing,
            ),
        ];
        for (run_entries, status_entries, expected) in cases {
            let (detail, _) = read(detail_stubs(
                pull(7, json!({})),
                Stub::ok(&runs(run_entries.clone())),
                Stub::ok(&statuses(status_entries.clone())),
            ));
            assert_eq!(
                detail.checks.summary, expected,
                "{run_entries} with {status_entries}"
            );
        }
    }

    #[test]
    fn each_check_says_where_it_came_from_and_how_it_ended() {
        let (detail, _) = read(detail_stubs(
            pull(7, json!({})),
            Stub::ok(&runs(json!([
                { "name": "build", "status": "completed", "conclusion": "failure",
                  "app": { "name": "GitHub Actions" } }
            ]))),
            Stub::ok(&statuses(json!([
                { "context": "ci/legacy", "state": "pending", "description": "Queued" }
            ]))),
        ));

        let [run, status] = &detail.checks.entries[..] else {
            panic!("two checks expected");
        };
        assert_eq!(run.source, CheckSource::Run);
        assert_eq!(run.outcome, Outcome::Failing);
        assert_eq!(run.state, "failure");
        assert_eq!(run.description.as_deref(), Some("GitHub Actions"));
        assert_eq!(status.source, CheckSource::Status);
        assert_eq!(status.name, "ci/legacy");
        assert_eq!(status.outcome, Outcome::Pending);
        assert_eq!(status.description.as_deref(), Some("Queued"));
    }

    #[test]
    fn more_checks_than_were_read_are_reported_as_truncated() {
        let one = json!([{ "name": "build", "status": "completed", "conclusion": "success" }]);
        let (detail, _) = read(detail_stubs(
            pull(7, json!({})),
            Stub::ok(&json!({ "total_count": 250, "check_runs": one }).to_string()),
            Stub::ok(&statuses(json!([]))),
        ));

        assert!(detail.checks.truncated);
        assert_eq!(detail.checks.entries.len(), 1);
    }

    #[test]
    fn a_refused_checks_source_leaves_the_other_and_the_pull_request_readable() {
        let refused = || {
            Stub::code(
                403,
                r#"{"message":"Resource not accessible by personal access token"}"#,
            )
        };
        let (runs_refused, _) = read(detail_stubs(
            pull(7, json!({})),
            refused(),
            Stub::ok(&statuses(json!([{ "context": "ci", "state": "success" }]))),
        ));
        let (statuses_refused, _) = read(detail_stubs(
            pull(7, json!({})),
            Stub::ok(&runs(json!([
                { "name": "build", "status": "completed", "conclusion": "failure" }
            ]))),
            refused(),
        ));

        assert!(runs_refused.checks.runs_denied);
        assert!(!runs_refused.checks.statuses_denied);
        assert_eq!(runs_refused.checks.summary, Summary::Passing);
        assert!(statuses_refused.checks.statuses_denied);
        assert!(!statuses_refused.checks.runs_denied);
        assert_eq!(statuses_refused.checks.summary, Summary::Failing);
        assert!(runs_refused.checks.error.is_none());
    }

    #[test]
    fn a_failed_checks_read_is_reported_inside_the_answer() {
        let (detail, _) = read(detail_stubs(
            pull(7, json!({ "title": "Still readable" })),
            Stub::code(500, r#"{"message":"Server Error"}"#),
            Stub::ok("not json"),
        ));

        assert_eq!(detail.pull.title, "Still readable");
        let error = detail.checks.error.expect("the failure was not reported");
        assert!(error.contains("Server Error"), "{error}");
        assert!(error.contains("could not read"), "{error}");
        assert_eq!(detail.checks.summary, Summary::None);
    }

    #[test]
    fn a_revoked_token_during_the_checks_read_still_signs_out() {
        let server = serve(vec![
            Stub::ok(&pull(7, json!({})).to_string()).header("ETag", "\"pull\""),
            Stub::code(401, r#"{"message":"Bad credentials"}"#),
        ]);
        let (mut service, store) = signed_in(&server);

        let failure = service.pull_request("MYY-sudo", "TBCE", 7).unwrap_err();

        assert_eq!(failure.code, "GITHUB_AUTH_FAILED");
        assert_eq!(stored(&store), None);
        assert!(service.cache.is_empty());
        assert_eq!(
            server.requests(),
            2,
            "the statuses were read with a revoked token"
        );
    }

    #[test]
    fn a_head_commit_that_is_not_hexadecimal_is_never_put_in_a_path() {
        for sha in [
            "../../user".to_string(),
            "abc".to_string(),
            "g".repeat(40),
            format!("{SHA}?x=1"),
        ] {
            let head = json!({ "ref": "b", "sha": sha, "repo": null });
            let server = serve(vec![Stub::ok(
                &pull(7, json!({ "head": head })).to_string(),
            )]);
            let (mut service, _) = signed_in(&server);

            let detail = service.pull_request("MYY-sudo", "TBCE", 7).unwrap();

            assert_eq!(server.requests(), 1, "{sha} reached a request path");
            assert!(detail.checks.error.is_some());
        }
    }

    #[test]
    fn changed_files_keep_renames_and_say_when_github_sent_no_patch() {
        let files = json!([
            { "filename": "src/app.ts", "status": "modified", "additions": 3,
              "deletions": 1, "changes": 4, "patch": "@@ -1 +1 @@\n-a\n+b" },
            { "filename": "src/new name.ts", "previous_filename": "src/old.ts",
              "status": "renamed", "additions": 0, "deletions": 0, "changes": 0 },
            { "filename": "logo.png", "status": "added", "additions": 0,
              "deletions": 0, "changes": 0 }
        ]);
        let server = serve(vec![Stub::ok(&files.to_string())
            .header("Link", "<http://example.invalid/?page=3>; rel=\"next\"")]);
        let (mut service, _) = signed_in(&server);

        let page = service.pull_files("MYY-sudo", "TBCE", 7, 2).unwrap();

        assert_eq!(
            server.path(0),
            format!("/repos/MYY-sudo/TBCE/pulls/7/files?per_page={PER_PAGE}&page=2")
        );
        assert!(page.has_more);
        assert_eq!(page.items[0].patch.as_deref(), Some("@@ -1 +1 @@\n-a\n+b"));
        assert_eq!(page.items[0].additions, 3);
        assert_eq!(page.items[1].previous_path.as_deref(), Some("src/old.ts"));
        assert_eq!(page.items[1].status, "renamed");
        assert_eq!(page.items[2].patch, None);
    }

    #[test]
    fn a_page_of_patches_may_exceed_the_metadata_cap_and_is_then_not_cached() {
        let patch = format!("@@ -1 +1 @@\n+{}", "ş".repeat(20_000));
        let files: Vec<Value> = (0..PER_PAGE)
            .map(|index| {
                json!({ "filename": format!("file{index}.txt"), "status": "modified",
                        "additions": 1, "deletions": 0, "patch": patch })
            })
            .collect();
        let body = Value::Array(files).to_string();
        assert!(
            body.len() > BODY_CAP,
            "the fixture is not larger than the cap"
        );
        let server = serve(vec![Stub::ok(&body).header("ETag", "\"large\"")]);
        let (mut service, _) = signed_in(&server);

        let page = service.pull_files("MYY-sudo", "TBCE", 7, 1).unwrap();

        assert_eq!(page.items.len(), PER_PAGE as usize);
        assert!(
            service.cache.is_empty(),
            "an oversized page was kept in memory"
        );
    }

    #[test]
    fn a_missing_pull_request_is_named_and_number_zero_sends_nothing() {
        let server = serve(vec![Stub::code(404, r#"{"message":"Not Found"}"#)]);
        let (mut service, _) = signed_in(&server);

        let zero = service.pull_request("MYY-sudo", "TBCE", 0).unwrap_err();
        let zero_files = service.pull_files("MYY-sudo", "TBCE", 0, 1).unwrap_err();
        assert_eq!(server.requests(), 0);
        let missing = service.pull_request("MYY-sudo", "TBCE", 99).unwrap_err();

        assert_eq!(zero.code, "GITHUB_INVALID_PULL");
        assert_eq!(zero_files.code, "GITHUB_INVALID_PULL");
        assert_eq!(missing.code, "GITHUB_NOT_FOUND");
        assert!(
            missing.message.contains("pull request #99"),
            "{}",
            missing.message
        );
    }

    #[test]
    fn a_refused_list_is_reported_as_forbidden() {
        let server = serve(vec![Stub::code(
            403,
            r#"{"message":"Resource not accessible by personal access token"}"#,
        )]);
        let (mut service, _) = signed_in(&server);

        let failure = service
            .pull_requests("MYY-sudo", "TBCE", PullState::Open, 1)
            .unwrap_err();

        assert_eq!(failure.code, "GITHUB_FORBIDDEN");
    }

    #[test]
    fn a_state_other_than_open_or_closed_cannot_be_sent() {
        for state in ["\"all\"", "\"open&x=1\"", "\"merged\""] {
            assert!(
                serde_json::from_str::<PullState>(state).is_err(),
                "{state} was accepted"
            );
        }
        assert_eq!(
            serde_json::from_str::<PullState>("\"closed\"").unwrap(),
            PullState::Closed
        );
    }

    #[test]
    fn nothing_in_the_pull_request_viewer_writes() {
        let mut stubs = vec![Stub::ok(&json!([pull(7, json!({}))]).to_string())];
        stubs.extend(detail_stubs(
            pull(7, json!({})),
            Stub::ok(&runs(json!([]))),
            Stub::ok(&statuses(json!([]))),
        ));
        stubs.push(Stub::ok("[]"));
        let server = serve(stubs);
        let (mut service, _) = signed_in(&server);

        service
            .pull_requests("MYY-sudo", "TBCE", PullState::Open, 1)
            .unwrap();
        service.pull_request("MYY-sudo", "TBCE", 7).unwrap();
        service.pull_files("MYY-sudo", "TBCE", 7, 1).unwrap();

        assert_eq!(server.requests(), 5);
        for index in 0..5 {
            assert_eq!(
                server.method(index),
                "GET",
                "request {index} was not a read"
            );
            assert_eq!(
                server.json(index),
                Value::Null,
                "request {index} carried a body"
            );
        }
    }
}
