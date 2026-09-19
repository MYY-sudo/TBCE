//! GitHub issues: listing, reading, creating, closing and reopening. These are the first requests
//! TBCE sends that change anything on GitHub, so every value the webview supplies is checked here
//! before a request exists, and a request that could touch a pull request is refused before it is
//! sent. The models stay GitHub's own and are not shared with the rest of TBCE.

use super::{
    clamp, encode, parse, segment, GitHubService, Method, OwnerBody, Page, RateLimit,
    LIST_PAGE_CAP, PER_PAGE,
};
use crate::filesystem::{Result, ServiceError};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Map, Value};

/// GitHub's own limits, enforced here so a refusal arrives before the request rather than after.
const TITLE_MAX: usize = 256;
const BODY_MAX: usize = 65_536;
const LABEL_MAX: usize = 50;
const LABELS_MAX: usize = 100;
const LOGIN_MAX: usize = 39;
const ASSIGNEES_MAX: usize = 10;
/// Labels, assignees and milestones are read whole for the pickers, a hundred at a time and at
/// most five pages each. A repository with more is reported as truncated rather than read forever.
const CHOICE_PAGE: u32 = 100;
const CHOICE_PAGES: u32 = 5;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IssueState {
    Open,
    Closed,
}

impl IssueState {
    fn name(self) -> &'static str {
        match self {
            IssueState::Open => "open",
            IssueState::Closed => "closed",
        }
    }
}

/// Why an issue is closed. A closed set, so the webview cannot send GitHub a reason of its own.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CloseReason {
    Completed,
    NotPlanned,
}

impl CloseReason {
    fn name(self) -> &'static str {
        match self {
            CloseReason::Completed => "completed",
            CloseReason::NotPlanned => "not_planned",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub name: String,
    /// Six hexadecimal digits, or nothing. The panel puts this in a style, so nothing else passes.
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneReference {
    pub number: u64,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub number: u64,
    pub title: String,
    pub state: IssueState,
    /// `completed`, `not_planned` or `reopened`, as GitHub reports it.
    pub state_reason: Option<String>,
    pub author: Option<String>,
    pub labels: Vec<Label>,
    pub assignees: Vec<String>,
    pub milestone: Option<MilestoneReference>,
    pub comments: u64,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
}

/// One issue with its body. The body is text for the panel to show as written, never markup.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDetail {
    #[serde(flatten)]
    pub issue: Issue,
    pub body: Option<String>,
    pub rate: Option<RateLimit>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelChoice {
    pub name: String,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneChoice {
    pub number: u64,
    pub title: String,
    pub due_on: Option<String>,
}

/// What the filters and the new-issue form can offer. Only open milestones are offered, because
/// those are the ones an issue is filed against.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueChoices {
    pub labels: Vec<LabelChoice>,
    pub assignees: Vec<String>,
    pub milestones: Vec<MilestoneChoice>,
    /// At least one list stopped at its page limit.
    pub truncated: bool,
    pub rate: Option<RateLimit>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueFilter {
    pub state: IssueState,
    #[serde(default)]
    pub label: Option<String>,
    /// A login, or `none` for issues nobody is assigned to.
    #[serde(default)]
    pub assignee: Option<String>,
    /// A milestone number, or `none` for issues without one.
    #[serde(default)]
    pub milestone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDraft {
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub assignees: Vec<String>,
    #[serde(default)]
    pub milestone: Option<u64>,
}

/// What GitHub silently left out. Labels, assignees and a milestone are applied only for someone
/// with push access, and GitHub drops them without an error otherwise, so the answer is compared
/// with the request and the difference is reported rather than assumed away.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dropped {
    pub labels: Vec<String>,
    pub assignees: Vec<String>,
    pub milestone: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueCreated {
    pub issue: IssueDetail,
    pub dropped: Dropped,
}

#[derive(Deserialize)]
struct IssueBody {
    number: u64,
    title: String,
    state: IssueState,
    #[serde(default)]
    state_reason: Option<String>,
    #[serde(default)]
    user: Option<OwnerBody>,
    #[serde(default)]
    labels: Vec<LabelBody>,
    #[serde(default)]
    assignees: Vec<OwnerBody>,
    #[serde(default)]
    milestone: Option<MilestoneBody>,
    #[serde(default)]
    comments: u64,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    #[serde(default)]
    body: Option<String>,
    /// Present on pull requests, which GitHub's issue endpoints also return.
    #[serde(default)]
    pull_request: Option<Value>,
}

#[derive(Deserialize)]
pub(super) struct LabelBody {
    name: String,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

impl LabelBody {
    pub(super) fn label(self) -> Label {
        Label {
            name: self.name,
            color: color(self.color),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct MilestoneBody {
    number: u64,
    title: String,
    #[serde(default)]
    due_on: Option<String>,
}

impl MilestoneBody {
    pub(super) fn reference(self) -> MilestoneReference {
        MilestoneReference {
            number: self.number,
            title: self.title,
        }
    }
}

impl IssueBody {
    fn summary(self) -> (Issue, Option<String>) {
        let issue = Issue {
            number: self.number,
            title: self.title,
            state: self.state,
            state_reason: self.state_reason,
            author: self.user.map(|user| user.login),
            labels: self.labels.into_iter().map(LabelBody::label).collect(),
            assignees: self.assignees.into_iter().map(|user| user.login).collect(),
            milestone: self.milestone.map(MilestoneBody::reference),
            comments: self.comments,
            created_at: self.created_at,
            updated_at: self.updated_at,
            closed_at: self.closed_at,
        };
        (issue, self.body)
    }

    fn detail(self, rate: Option<RateLimit>) -> IssueDetail {
        let (issue, body) = self.summary();
        IssueDetail { issue, body, rate }
    }
}

impl GitHubService {
    /// One page of issues. Pull requests arrive from the same endpoint and are left out, so a page
    /// can be shorter than thirty while GitHub still advertises another one.
    pub fn issues(
        &mut self,
        owner: &str,
        repo: &str,
        filter: &IssueFilter,
        page: u32,
    ) -> Result<Page<Issue>> {
        let page = clamp(page);
        let mut path = format!(
            "/repos/{}/{}/issues?state={}",
            segment(owner)?,
            segment(repo)?,
            filter.state.name()
        );
        if let Some(label) = present(&filter.label) {
            validate_label(label)?;
            path.push_str("&labels=");
            path.push_str(&encode(label));
        }
        if let Some(assignee) = present(&filter.assignee) {
            if assignee != "none" {
                validate_login(assignee)?;
            }
            path.push_str("&assignee=");
            path.push_str(assignee);
        }
        if let Some(milestone) = present(&filter.milestone) {
            if milestone != "none" {
                milestone_number(milestone)?;
            }
            path.push_str("&milestone=");
            path.push_str(milestone);
        }
        path.push_str(&format!("&per_page={PER_PAGE}&page={page}"));
        let answer = self
            .get_capped(&path, LIST_PAGE_CAP)
            .map_err(|error| match error.code {
                "GITHUB_GONE" => ServiceError::new(
                    "GITHUB_ISSUES_DISABLED",
                    "Issues are turned off for this repository.",
                ),
                _ => error,
            })?;
        let bodies: Vec<IssueBody> = parse(&answer.body)?;
        Ok(Page {
            items: bodies
                .into_iter()
                .filter(|body| body.pull_request.is_none())
                .map(|body| body.summary().0)
                .collect(),
            page,
            has_more: answer.has_more,
            rate: answer.rate,
        })
    }

    pub fn issue(&mut self, owner: &str, repo: &str, number: u64) -> Result<IssueDetail> {
        let (body, rate) = self.issue_body(owner, repo, number)?;
        Ok(body.detail(rate))
    }

    pub fn issue_choices(&mut self, owner: &str, repo: &str) -> Result<IssueChoices> {
        let base = format!("/repos/{}/{}", segment(owner)?, segment(repo)?);
        let (labels, labels_cut, _) = self.every::<LabelBody>(&format!("{base}/labels?"))?;
        let (assignees, assignees_cut, _) =
            self.every::<OwnerBody>(&format!("{base}/assignees?"))?;
        let (milestones, milestones_cut, rate) =
            self.every::<MilestoneBody>(&format!("{base}/milestones?state=open&"))?;
        Ok(IssueChoices {
            labels: labels
                .into_iter()
                .map(|label| LabelChoice {
                    name: label.name,
                    color: color(label.color),
                    description: label.description.filter(|text| !text.is_empty()),
                })
                .collect(),
            assignees: assignees.into_iter().map(|user| user.login).collect(),
            milestones: milestones
                .into_iter()
                .map(|milestone| MilestoneChoice {
                    number: milestone.number,
                    title: milestone.title,
                    due_on: milestone.due_on,
                })
                .collect(),
            truncated: labels_cut || assignees_cut || milestones_cut,
            rate,
        })
    }

    pub fn create_issue(
        &mut self,
        owner: &str,
        repo: &str,
        draft: IssueDraft,
    ) -> Result<IssueCreated> {
        let path = format!("/repos/{}/{}/issues", segment(owner)?, segment(repo)?);
        let request = Request::from(draft)?;
        let answer = self.write(Method::Post, &path, &request.json())?;
        let body: IssueBody = parse(&answer.body)?;
        let detail = body.detail(answer.rate);
        let dropped = request.dropped(&detail.issue);
        Ok(IssueCreated {
            issue: detail,
            dropped,
        })
    }

    pub fn close_issue(
        &mut self,
        owner: &str,
        repo: &str,
        number: u64,
        reason: CloseReason,
    ) -> Result<IssueDetail> {
        let change = json!({ "state": "closed", "state_reason": reason.name() });
        self.change_state(owner, repo, number, &change)
    }

    pub fn reopen_issue(&mut self, owner: &str, repo: &str, number: u64) -> Result<IssueDetail> {
        self.change_state(owner, repo, number, &json!({ "state": "open" }))
    }

    /// GitHub's issue endpoint closes a pull request just as readily as an issue, so the number is
    /// read first and a pull request is refused before anything is changed.
    fn change_state(
        &mut self,
        owner: &str,
        repo: &str,
        number: u64,
        change: &Value,
    ) -> Result<IssueDetail> {
        self.issue_body(owner, repo, number)?;
        let path = format!(
            "/repos/{}/{}/issues/{number}",
            segment(owner)?,
            segment(repo)?
        );
        let answer = self
            .write(Method::Patch, &path, change)
            .map_err(|error| missing(error, number))?;
        let body: IssueBody = parse(&answer.body)?;
        Ok(body.detail(answer.rate))
    }

    fn issue_body(
        &mut self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<(IssueBody, Option<RateLimit>)> {
        validate_number(number)?;
        let path = format!(
            "/repos/{}/{}/issues/{number}",
            segment(owner)?,
            segment(repo)?
        );
        let answer = self.get(&path).map_err(|error| missing(error, number))?;
        let body: IssueBody = parse(&answer.body)?;
        if body.pull_request.is_some() {
            return Err(ServiceError::new(
                "GITHUB_NOT_AN_ISSUE",
                format!("#{number} is a pull request, not an issue."),
            ));
        }
        Ok((body, answer.rate))
    }

    /// Every page of a list, up to the page limit. `base` ends in `?` or `&`.
    fn every<T: DeserializeOwned>(
        &mut self,
        base: &str,
    ) -> Result<(Vec<T>, bool, Option<RateLimit>)> {
        let mut items = Vec::new();
        let mut rate = None;
        for page in 1..=CHOICE_PAGES {
            let answer = self.get(&format!("{base}per_page={CHOICE_PAGE}&page={page}"))?;
            let mut batch: Vec<T> = parse(&answer.body)?;
            items.append(&mut batch);
            rate = answer.rate.or(rate);
            if !answer.has_more {
                return Ok((items, false, rate));
            }
        }
        Ok((items, true, rate))
    }
}

/// A draft that has passed every check, in the form GitHub is sent.
struct Request {
    title: String,
    body: String,
    labels: Vec<String>,
    assignees: Vec<String>,
    milestone: Option<u64>,
}

impl Request {
    fn from(draft: IssueDraft) -> Result<Self> {
        let title = draft.title.trim().to_string();
        if title.is_empty() {
            return Err(refused("An issue needs a title."));
        }
        if title.chars().count() > TITLE_MAX {
            return Err(refused(&format!(
                "An issue title can be at most {TITLE_MAX} characters."
            )));
        }
        if draft.body.chars().count() > BODY_MAX {
            return Err(refused(&format!(
                "An issue body can be at most {BODY_MAX} characters."
            )));
        }
        let labels = distinct(draft.labels);
        if labels.len() > LABELS_MAX {
            return Err(refused(&format!(
                "An issue can have at most {LABELS_MAX} labels."
            )));
        }
        for label in &labels {
            validate_label(label)?;
        }
        let assignees = distinct(draft.assignees);
        if assignees.len() > ASSIGNEES_MAX {
            return Err(refused(&format!(
                "An issue can have at most {ASSIGNEES_MAX} assignees."
            )));
        }
        for assignee in &assignees {
            validate_login(assignee)?;
        }
        if let Some(milestone) = draft.milestone {
            validate_number(milestone)?;
        }
        Ok(Self {
            title,
            body: draft.body,
            labels,
            assignees,
            milestone: draft.milestone,
        })
    }

    fn json(&self) -> Value {
        let mut request = Map::new();
        request.insert("title".into(), json!(self.title));
        if !self.body.trim().is_empty() {
            request.insert("body".into(), json!(self.body));
        }
        if !self.labels.is_empty() {
            request.insert("labels".into(), json!(self.labels));
        }
        if !self.assignees.is_empty() {
            request.insert("assignees".into(), json!(self.assignees));
        }
        if let Some(milestone) = self.milestone {
            request.insert("milestone".into(), json!(milestone));
        }
        Value::Object(request)
    }

    /// GitHub treats label names and logins case-insensitively and answers with its own spelling,
    /// so the comparison does too.
    fn dropped(&self, issue: &Issue) -> Dropped {
        let labels: Vec<&str> = issue
            .labels
            .iter()
            .map(|label| label.name.as_str())
            .collect();
        let assignees: Vec<&str> = issue.assignees.iter().map(String::as_str).collect();
        Dropped {
            labels: absent(&self.labels, &labels),
            assignees: absent(&self.assignees, &assignees),
            milestone: self.milestone.is_some()
                && self.milestone != issue.milestone.as_ref().map(|milestone| milestone.number),
        }
    }
}

/// The requested names GitHub's answer does not contain.
fn absent(wanted: &[String], applied: &[&str]) -> Vec<String> {
    wanted
        .iter()
        .filter(|name| !applied.iter().any(|seen| seen.eq_ignore_ascii_case(name)))
        .cloned()
        .collect()
}

fn present(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

/// Trimmed, empty entries dropped, and each name kept once in the order it was first given.
fn distinct(values: Vec<String>) -> Vec<String> {
    let mut kept: Vec<String> = Vec::new();
    for value in values {
        let value = value.trim().to_string();
        if !value.is_empty() && !kept.iter().any(|seen| seen.eq_ignore_ascii_case(&value)) {
            kept.push(value);
        }
    }
    kept
}

fn color(value: Option<String>) -> Option<String> {
    value
        .filter(|value| value.len() == 6 && value.chars().all(|c| c.is_ascii_hexdigit()))
        .map(|value| value.to_ascii_lowercase())
}

fn refused(message: &str) -> ServiceError {
    ServiceError::new("GITHUB_INVALID_ISSUE", message)
}

fn missing(error: ServiceError, number: u64) -> ServiceError {
    match error.code {
        "GITHUB_NOT_FOUND" => ServiceError::new(
            "GITHUB_NOT_FOUND",
            format!("GitHub has no issue #{number} here, or this token cannot see it."),
        ),
        _ => error,
    }
}

fn validate_number(number: u64) -> Result<()> {
    if number == 0 {
        return Err(refused("That issue number cannot be used."));
    }
    Ok(())
}

fn milestone_number(value: &str) -> Result<u64> {
    value
        .parse::<u64>()
        .ok()
        .filter(|number| *number > 0)
        .ok_or_else(|| refused("That milestone cannot be used."))
}

pub(super) fn validate_label(label: &str) -> Result<()> {
    if label.is_empty() || label.chars().count() > LABEL_MAX || label.chars().any(char::is_control)
    {
        return Err(refused(&format!("The label \"{label}\" cannot be used.")));
    }
    Ok(())
}

/// A GitHub login: letters, digits and hyphens, plus the underscore managed accounts use.
fn validate_login(login: &str) -> Result<()> {
    let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '-' | '_');
    if login.is_empty() || login.len() > LOGIN_MAX || !login.chars().all(allowed) {
        return Err(refused(&format!("\"{login}\" is not a GitHub login.")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::mock::*;
    use super::super::{BODY_CAP, PER_PAGE};
    use super::*;

    /// An issue as GitHub serializes one, with `extra` merged over the defaults.
    fn issue(number: u64, extra: Value) -> Value {
        let mut issue = json!({
            "number": number,
            "title": format!("Issue {number}"),
            "state": "open",
            "user": { "login": "octocat" },
            "labels": [],
            "assignees": [],
            "milestone": null,
            "comments": 0,
            "created_at": "2026-09-18T10:00:00Z",
            "body": "body",
        });
        for (key, value) in extra.as_object().expect("an object") {
            issue[key] = value.clone();
        }
        issue
    }

    fn pull_request(number: u64) -> Value {
        issue(
            number,
            json!({ "pull_request": { "url": "https://example.invalid" } }),
        )
    }

    fn open() -> IssueFilter {
        IssueFilter {
            state: IssueState::Open,
            label: None,
            assignee: None,
            milestone: None,
        }
    }

    fn draft(title: &str) -> IssueDraft {
        IssueDraft {
            title: title.to_string(),
            body: String::new(),
            labels: Vec::new(),
            assignees: Vec::new(),
            milestone: None,
        }
    }

    #[test]
    fn pull_requests_are_left_out_while_paging_still_follows_the_link_header() {
        let page = json!([issue(3, json!({})), pull_request(2), issue(1, json!({}))]);
        let server = serve(vec![
            Stub::ok(&page.to_string())
                .header("Link", "<http://example.invalid/?page=2>; rel=\"next\""),
            Stub::ok(&json!([pull_request(9)]).to_string()),
        ]);
        let (mut service, _) = signed_in(&server);

        let first = service.issues("MYY-sudo", "TBCE", &open(), 1).unwrap();
        let second = service.issues("MYY-sudo", "TBCE", &open(), 2).unwrap();

        let numbers: Vec<u64> = first.items.iter().map(|issue| issue.number).collect();
        assert_eq!(numbers, vec![3, 1]);
        assert!(
            first.has_more,
            "a short page hid the page GitHub advertised"
        );
        assert!(second.items.is_empty());
        assert!(!second.has_more);
        assert_eq!(
            server.path(0),
            format!("/repos/MYY-sudo/TBCE/issues?state=open&per_page={PER_PAGE}&page=1")
        );
    }

    #[test]
    fn labels_assignees_and_milestones_survive_the_round_trip() {
        let body = json!([issue(
            7,
            json!({
                "title": "Türkçe başlık 🎉",
                "state": "closed",
                "state_reason": "not_planned",
                "labels": [
                    { "name": "bug", "color": "D73A4A" },
                    { "name": "odd", "color": "url(x)" }
                ],
                "assignees": [{ "login": "oyku" }, { "login": "octocat" }],
                "milestone": { "number": 2, "title": "V1", "due_on": null },
                "comments": 4,
                "closed_at": "2026-09-18T11:00:00Z"
            })
        )]);
        let server = serve(vec![Stub::ok(&body.to_string())]);
        let (mut service, _) = signed_in(&server);

        let filter = IssueFilter {
            state: IssueState::Closed,
            ..open()
        };
        let page = service.issues("MYY-sudo", "TBCE", &filter, 1).unwrap();

        let issue = &page.items[0];
        assert_eq!(issue.title, "Türkçe başlık 🎉");
        assert_eq!(issue.state, IssueState::Closed);
        assert_eq!(issue.state_reason.as_deref(), Some("not_planned"));
        assert_eq!(issue.labels[0].color.as_deref(), Some("d73a4a"));
        assert_eq!(
            issue.labels[1].color, None,
            "a colour that is not six hex digits reached the panel"
        );
        assert_eq!(issue.assignees, vec!["oyku", "octocat"]);
        assert_eq!(issue.milestone.as_ref().map(|m| m.number), Some(2));
        assert_eq!(issue.comments, 4);
        assert!(server.path(0).contains("state=closed"));
    }

    #[test]
    fn filter_values_are_encoded_so_a_label_cannot_add_a_parameter() {
        let server = serve(vec![Stub::ok("[]")]);
        let (mut service, _) = signed_in(&server);
        let filter = IssueFilter {
            state: IssueState::Open,
            label: Some("bug&state=all #1 ü".into()),
            assignee: Some("none".into()),
            milestone: Some("3".into()),
        };

        service.issues("MYY-sudo", "TBCE", &filter, 1).unwrap();

        let path = server.path(0);
        assert!(
            path.contains("&labels=bug%26state%3Dall%20%231%20%C3%BC&"),
            "{path}"
        );
        assert!(path.contains("&assignee=none&milestone=3&"), "{path}");
        assert_eq!(path.matches("state=").count(), 1, "{path}");
    }

    #[test]
    fn a_crafted_filter_sends_nothing() {
        let server = serve(vec![Stub::ok("[]")]);
        let (mut service, _) = signed_in(&server);

        for filter in [
            IssueFilter {
                assignee: Some("octocat&state=all".into()),
                ..open()
            },
            IssueFilter {
                milestone: Some("1&x=2".into()),
                ..open()
            },
            IssueFilter {
                milestone: Some("0".into()),
                ..open()
            },
            IssueFilter {
                label: Some("line\nbreak".into()),
                ..open()
            },
            IssueFilter {
                label: Some("x".repeat(LABEL_MAX + 1)),
                ..open()
            },
        ] {
            let failure = service.issues("MYY-sudo", "TBCE", &filter, 1).unwrap_err();
            assert_eq!(failure.code, "GITHUB_INVALID_ISSUE", "accepted {filter:?}");
        }
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn an_invalid_draft_or_number_sends_nothing() {
        let server = serve(vec![Stub::ok("{}")]);
        let (mut service, _) = signed_in(&server);
        let many = |count: usize| (0..count).map(|i| format!("user{i}")).collect();

        for candidate in [
            draft(""),
            draft("   "),
            draft(&"x".repeat(TITLE_MAX + 1)),
            IssueDraft {
                body: "x".repeat(BODY_MAX + 1),
                ..draft("title")
            },
            IssueDraft {
                assignees: many(ASSIGNEES_MAX + 1),
                ..draft("title")
            },
            IssueDraft {
                assignees: vec!["not a login".into()],
                ..draft("title")
            },
            IssueDraft {
                labels: vec!["tab\there".into()],
                ..draft("title")
            },
            IssueDraft {
                milestone: Some(0),
                ..draft("title")
            },
        ] {
            let failure = service
                .create_issue("MYY-sudo", "TBCE", candidate)
                .unwrap_err();
            assert_eq!(failure.code, "GITHUB_INVALID_ISSUE");
        }
        for failure in [
            service.issue("MYY-sudo", "TBCE", 0).unwrap_err(),
            service
                .close_issue("MYY-sudo", "TBCE", 0, CloseReason::Completed)
                .unwrap_err(),
            service.reopen_issue("MYY-sudo", "TBCE", 0).unwrap_err(),
        ] {
            assert_eq!(failure.code, "GITHUB_INVALID_ISSUE");
        }
        assert_eq!(server.requests(), 0, "a refused value still reached GitHub");
    }

    #[test]
    fn a_title_of_exactly_the_limit_in_multibyte_characters_is_accepted() {
        let title = "ğ".repeat(TITLE_MAX);
        let server = serve(vec![Stub::code(
            201,
            &issue(1, json!({ "title": title })).to_string(),
        )]);
        let (mut service, _) = signed_in(&server);

        let created = service
            .create_issue("MYY-sudo", "TBCE", draft(&title))
            .unwrap();

        assert_eq!(created.issue.issue.title, title);
    }

    #[test]
    fn creating_posts_the_checked_draft_as_json() {
        let answer = issue(
            12,
            json!({
                "title": "Çökme: kaydetme",
                "body": "Adımlar:\n1. aç\n2. kaydet",
                "labels": [{ "name": "Bug", "color": "d73a4a" }],
                "assignees": [{ "login": "Oyku" }],
                "milestone": { "number": 4, "title": "V1" }
            }),
        );
        let server = serve(vec![Stub::code(201, &answer.to_string())]);
        let (mut service, _) = signed_in(&server);

        let created = service
            .create_issue(
                "MYY-sudo",
                "TBCE",
                IssueDraft {
                    title: "  Çökme: kaydetme ".into(),
                    body: "Adımlar:\n1. aç\n2. kaydet".into(),
                    labels: vec!["bug".into(), "BUG".into(), " ".into()],
                    assignees: vec!["oyku".into()],
                    milestone: Some(4),
                },
            )
            .unwrap();

        assert_eq!(server.method(0), "POST");
        assert_eq!(server.path(0), "/repos/MYY-sudo/TBCE/issues");
        assert_eq!(
            server.sent(0, "content-type").as_deref(),
            Some("application/json")
        );
        assert_eq!(
            server.json(0),
            json!({
                "title": "Çökme: kaydetme",
                "body": "Adımlar:\n1. aç\n2. kaydet",
                "labels": ["bug"],
                "assignees": ["oyku"],
                "milestone": 4
            })
        );
        assert_eq!(created.issue.issue.number, 12);
        assert_eq!(
            created.issue.body.as_deref(),
            Some("Adımlar:\n1. aç\n2. kaydet")
        );
        assert!(created.dropped.labels.is_empty());
        assert!(created.dropped.assignees.is_empty());
        assert!(!created.dropped.milestone);
    }

    #[test]
    fn an_empty_body_and_empty_lists_are_not_sent() {
        let server = serve(vec![Stub::code(201, &issue(1, json!({})).to_string())]);
        let (mut service, _) = signed_in(&server);

        service
            .create_issue(
                "MYY-sudo",
                "TBCE",
                IssueDraft {
                    body: "  \n ".into(),
                    ..draft("Only a title")
                },
            )
            .unwrap();

        assert_eq!(server.json(0), json!({ "title": "Only a title" }));
    }

    #[test]
    fn metadata_github_silently_left_out_is_reported() {
        // GitHub drops labels, assignees and a milestone for someone without push access, and
        // still answers 201.
        let server = serve(vec![Stub::code(201, &issue(5, json!({})).to_string())]);
        let (mut service, _) = signed_in(&server);

        let created = service
            .create_issue(
                "MYY-sudo",
                "TBCE",
                IssueDraft {
                    labels: vec!["bug".into()],
                    assignees: vec!["oyku".into()],
                    milestone: Some(2),
                    ..draft("title")
                },
            )
            .unwrap();

        assert_eq!(created.dropped.labels, vec!["bug"]);
        assert_eq!(created.dropped.assignees, vec!["oyku"]);
        assert!(created.dropped.milestone);
    }

    #[test]
    fn a_pull_request_is_never_closed_or_reopened_through_the_issue_endpoint() {
        let server = serve(vec![
            Stub::ok(&pull_request(8).to_string()),
            Stub::ok(&pull_request(8).to_string()),
            Stub::ok(&pull_request(8).to_string()),
        ]);
        let (mut service, _) = signed_in(&server);

        let close = service
            .close_issue("MYY-sudo", "TBCE", 8, CloseReason::Completed)
            .unwrap_err();
        let reopen = service.reopen_issue("MYY-sudo", "TBCE", 8).unwrap_err();
        let read = service.issue("MYY-sudo", "TBCE", 8).unwrap_err();

        for failure in [close, reopen, read] {
            assert_eq!(failure.code, "GITHUB_NOT_AN_ISSUE");
        }
        assert_eq!(server.requests(), 3);
        for index in 0..3 {
            assert_eq!(server.method(index), "GET", "a pull request was changed");
        }
    }

    #[test]
    fn closing_sends_the_chosen_reason_and_reopening_sends_open() {
        let closed = issue(
            4,
            json!({ "state": "closed", "state_reason": "not_planned" }),
        );
        let reopened = issue(4, json!({ "state_reason": "reopened" }));
        let server = serve(vec![
            Stub::ok(&issue(4, json!({})).to_string()),
            Stub::ok(&closed.to_string()),
            Stub::ok(&closed.to_string()),
            Stub::ok(&reopened.to_string()),
            Stub::ok(&issue(4, json!({})).to_string()),
            Stub::ok(&closed.to_string()),
        ]);
        let (mut service, _) = signed_in(&server);

        let first = service
            .close_issue("MYY-sudo", "TBCE", 4, CloseReason::NotPlanned)
            .unwrap();
        let second = service.reopen_issue("MYY-sudo", "TBCE", 4).unwrap();
        service
            .close_issue("MYY-sudo", "TBCE", 4, CloseReason::Completed)
            .unwrap();

        assert_eq!(server.method(0), "GET");
        assert_eq!(server.method(1), "PATCH");
        assert_eq!(server.path(1), "/repos/MYY-sudo/TBCE/issues/4");
        assert_eq!(
            server.json(1),
            json!({ "state": "closed", "state_reason": "not_planned" })
        );
        assert_eq!(first.issue.state, IssueState::Closed);
        assert_eq!(server.json(3), json!({ "state": "open" }));
        assert_eq!(second.issue.state, IssueState::Open);
        assert_eq!(
            server.json(5),
            json!({ "state": "closed", "state_reason": "completed" })
        );
    }

    #[test]
    fn each_issue_failure_is_named_for_what_it_is() {
        let server = serve(vec![
            Stub::code(410, r#"{"message":"Issues are disabled for this repo"}"#),
            Stub::code(404, r#"{"message":"Not Found"}"#),
            Stub::code(410, r#"{"message":"This issue was deleted"}"#),
            Stub::code(
                422,
                r#"{"message":"Validation Failed","errors":[{"field":"assignees"}]}"#,
            ),
            Stub::code(
                403,
                r#"{"message":"Resource not accessible by personal access token"}"#,
            ),
        ]);
        let (mut service, _) = signed_in(&server);

        let disabled = service.issues("MYY-sudo", "TBCE", &open(), 1).unwrap_err();
        let missing = service.issue("MYY-sudo", "TBCE", 99).unwrap_err();
        let deleted = service.issue("MYY-sudo", "TBCE", 98).unwrap_err();
        let invalid = service
            .create_issue("MYY-sudo", "TBCE", draft("title"))
            .unwrap_err();
        let read_only = service
            .create_issue("MYY-sudo", "TBCE", draft("title"))
            .unwrap_err();

        assert_eq!(disabled.code, "GITHUB_ISSUES_DISABLED");
        assert_eq!(missing.code, "GITHUB_NOT_FOUND");
        assert!(missing.message.contains("#99"), "{}", missing.message);
        assert_eq!(deleted.code, "GITHUB_GONE");
        assert!(deleted.message.contains("deleted"));
        assert_eq!(invalid.code, "GITHUB_VALIDATION_FAILED");
        assert!(invalid.message.contains("Validation Failed"));
        assert_eq!(read_only.code, "GITHUB_FORBIDDEN");
    }

    #[test]
    fn a_write_that_is_never_answered_is_unconfirmed_rather_than_failed() {
        let server = serve(vec![
            Stub::code(201, &issue(1, json!({})).to_string()).slow()
        ]);
        let (mut service, _) = signed_in(&server);

        let failure = service
            .create_issue("MYY-sudo", "TBCE", draft("title"))
            .unwrap_err();

        assert_eq!(
            failure.code, "GITHUB_WRITE_UNCONFIRMED",
            "{}: {}",
            failure.code, failure.message
        );
        assert_eq!(server.requests(), 1, "an unanswered write was sent again");
    }

    #[test]
    fn a_write_that_cannot_connect_is_an_ordinary_network_failure() {
        // Nothing listens here, so the request cannot have reached GitHub.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        let server = serve(vec![]);
        let (_, store) = signed_in(&server);
        let mut service = GitHubService::with(&base, Box::new(store));

        let failure = service
            .create_issue("MYY-sudo", "TBCE", draft("title"))
            .unwrap_err();

        assert_eq!(failure.code, "GITHUB_NETWORK_FAILED", "{}", failure.message);
    }

    #[test]
    fn a_revoked_token_during_a_write_clears_credentials_and_cache() {
        let server = serve(vec![
            Stub::ok("[]").header("ETag", "cached"),
            Stub::code(401, r#"{"message":"Bad credentials"}"#),
        ]);
        let (mut service, store) = signed_in(&server);
        service.issues("MYY-sudo", "TBCE", &open(), 1).unwrap();
        assert!(!service.cache.is_empty());

        let failure = service
            .create_issue("MYY-sudo", "TBCE", draft("title"))
            .unwrap_err();

        assert_eq!(failure.code, "GITHUB_AUTH_FAILED");
        assert_eq!(stored(&store), None);
        assert!(service.cache.is_empty());
    }

    #[test]
    fn a_token_never_reaches_a_write_failure() {
        let server = serve(vec![Stub::code(
            422,
            r#"{"message":"ghp_token cannot be used here"}"#,
        )]);
        let (mut service, _) = signed_in(&server);

        let failure = service
            .create_issue("MYY-sudo", "TBCE", draft("title"))
            .unwrap_err();

        assert!(
            !failure.message.contains("ghp_token"),
            "{}",
            failure.message
        );
    }

    #[test]
    fn an_issue_page_may_exceed_the_metadata_cap_and_is_then_not_cached() {
        let long = "ş".repeat(BODY_MAX);
        let page: Vec<Value> = (1..=PER_PAGE as u64)
            .map(|number| issue(number, json!({ "body": long })))
            .collect();
        let body = Value::Array(page).to_string();
        assert!(
            body.len() > BODY_CAP,
            "the fixture is not larger than the cap"
        );
        let server = serve(vec![Stub::ok(&body).header("ETag", "\"large\"")]);
        let (mut service, _) = signed_in(&server);

        let page = service.issues("MYY-sudo", "TBCE", &open(), 1).unwrap();

        assert_eq!(page.items.len(), PER_PAGE as usize);
        assert!(
            service.cache.is_empty(),
            "an answer above the metadata cap was kept in memory"
        );
    }

    #[test]
    fn a_single_issue_is_still_held_to_the_metadata_cap() {
        let oversized = issue(1, json!({ "body": "x".repeat(BODY_CAP + 1) }));
        let server = serve(vec![Stub::ok(&oversized.to_string())]);
        let (mut service, _) = signed_in(&server);

        let failure = service.issue("MYY-sudo", "TBCE", 1).unwrap_err();

        assert_eq!(failure.code, "GITHUB_RESPONSE_INVALID");
    }

    #[test]
    fn choices_are_read_whole_up_to_the_page_limit_and_say_when_they_stop() {
        let next = "<http://example.invalid/?page=2>; rel=\"next\"";
        let labels = json!([
            { "name": "bug", "color": "d73a4a", "description": "" },
            { "name": "iyileştirme", "color": "zzzzzz", "description": "Yeni özellik" }
        ])
        .to_string();
        let mut stubs: Vec<Stub> = (0..CHOICE_PAGES)
            .map(|_| Stub::ok(&labels).header("Link", next))
            .collect();
        stubs.push(Stub::ok(r#"[{"login":"oyku"}]"#));
        stubs.push(Stub::ok(
            r#"[{"number":2,"title":"V1","due_on":"2026-10-01T00:00:00Z"}]"#,
        ));
        let server = serve(stubs);
        let (mut service, _) = signed_in(&server);

        let choices = service.issue_choices("MYY-sudo", "TBCE").unwrap();

        assert!(choices.truncated);
        assert_eq!(choices.labels.len(), 2 * CHOICE_PAGES as usize);
        assert_eq!(choices.labels[0].description, None);
        assert_eq!(choices.labels[1].color, None);
        assert_eq!(choices.assignees, vec!["oyku"]);
        assert_eq!(choices.milestones[0].number, 2);
        assert_eq!(server.requests(), CHOICE_PAGES as usize + 2);
        assert_eq!(
            server.path(CHOICE_PAGES as usize - 1),
            format!("/repos/MYY-sudo/TBCE/labels?per_page={CHOICE_PAGE}&page={CHOICE_PAGES}")
        );
        assert_eq!(
            server.path(CHOICE_PAGES as usize + 1),
            format!("/repos/MYY-sudo/TBCE/milestones?state=open&per_page={CHOICE_PAGE}&page=1")
        );
    }

    #[test]
    fn choices_that_fit_are_not_reported_as_truncated() {
        let server = serve(vec![Stub::ok("[]"), Stub::ok("[]"), Stub::ok("[]")]);
        let (mut service, _) = signed_in(&server);

        let choices = service.issue_choices("MYY-sudo", "TBCE").unwrap();

        assert!(!choices.truncated);
        assert_eq!(server.requests(), 3);
    }
}
