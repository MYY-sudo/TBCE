//! The issues that belong to one area of the project's progress plan: those carrying the area's
//! label and those in its milestone, counted exactly. GitHub's issue list also returns pull
//! requests, and the counts GitHub keeps on a milestone include them, so issues are read and pull
//! requests left out here rather than taking a count GitHub has already made. Nothing here writes.

use super::issues::{validate_label, IssueState};
use super::{encode, parse, segment, GitHubService, RateLimit};
use crate::filesystem::{Result, ServiceError};
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const AREA_PAGE: u32 = 100;
/// Five hundred issues and pull requests per label or milestone. An area with more says so.
const AREA_PAGES: u32 = 5;
/// A page of a hundred issues carries a hundred bodies of up to 65,536 characters, each up to four
/// bytes in UTF-8. The bodies are not kept, but they have to be read.
const AREA_PAGE_CAP: usize = 100 * 65_536 * 4 + 1024 * 1024;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AreaIssue {
    pub number: u64,
    pub title: String,
    pub state: IssueState,
    /// Closed as not planned: left out of progress rather than counted as done.
    pub not_planned: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AreaIssues {
    /// Newest first, each issue once however it was found.
    pub issues: Vec<AreaIssue>,
    /// GitHub had more than was read for the label or the milestone.
    pub truncated: bool,
    pub rate: Option<RateLimit>,
}

#[derive(Deserialize)]
struct AreaIssueBody {
    number: u64,
    title: String,
    state: IssueState,
    #[serde(default)]
    state_reason: Option<String>,
    /// Present on pull requests.
    #[serde(default)]
    pull_request: Option<IgnoredAny>,
}

impl GitHubService {
    pub fn area_issues(
        &mut self,
        owner: &str,
        repo: &str,
        label: Option<&str>,
        milestone: Option<u64>,
    ) -> Result<AreaIssues> {
        let label = label.map(str::trim).filter(|label| !label.is_empty());
        if let Some(label) = label {
            validate_label(label)?;
            if label.contains(',') {
                return Err(ServiceError::new(
                    "GITHUB_INVALID_ISSUE",
                    "A label containing a comma would be read as two labels.",
                ));
            }
        }
        if milestone == Some(0) {
            return Err(ServiceError::new(
                "GITHUB_INVALID_ISSUE",
                "That milestone cannot be used.",
            ));
        }
        let base = format!(
            "/repos/{}/{}/issues?state=all",
            segment(owner)?,
            segment(repo)?
        );
        let mut filters = Vec::new();
        if let Some(label) = label {
            filters.push(format!("labels={}", encode(label)));
        }
        if let Some(milestone) = milestone {
            filters.push(format!("milestone={milestone}"));
        }
        let mut found = BTreeMap::new();
        let mut truncated = false;
        let mut rate = None;
        // GitHub combines filters with "and"; an area wants either, so each is read on its own.
        for filter in filters {
            for page in 1..=AREA_PAGES {
                let path = format!("{base}&{filter}&per_page={AREA_PAGE}&page={page}");
                let answer =
                    self.get_capped(&path, AREA_PAGE_CAP)
                        .map_err(|error| match error.code {
                            "GITHUB_GONE" => ServiceError::new(
                                "GITHUB_ISSUES_DISABLED",
                                "Issues are turned off for this repository.",
                            ),
                            _ => error,
                        })?;
                rate = answer.rate.or(rate);
                let bodies: Vec<AreaIssueBody> = parse(&answer.body)?;
                for body in bodies {
                    if body.pull_request.is_some() {
                        continue;
                    }
                    found.insert(
                        body.number,
                        AreaIssue {
                            number: body.number,
                            title: body.title,
                            state: body.state,
                            not_planned: body.state == IssueState::Closed
                                && body.state_reason.as_deref() == Some("not_planned"),
                        },
                    );
                }
                if !answer.has_more {
                    break;
                }
                if page == AREA_PAGES {
                    truncated = true;
                }
            }
        }
        Ok(AreaIssues {
            issues: found.into_values().rev().collect(),
            truncated,
            rate,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::mock::*;
    use super::*;
    use serde_json::{json, Value};

    fn issue(number: u64, state: &str, reason: Option<&str>) -> Value {
        json!({
            "number": number,
            "title": format!("Issue {number}"),
            "state": state,
            "state_reason": reason,
            "body": "a body that is read and not kept",
        })
    }

    fn pull_request(number: u64) -> Value {
        json!({
            "number": number,
            "title": format!("Pull request {number}"),
            "state": "open",
            "pull_request": { "url": "https://example.invalid" },
        })
    }

    fn next() -> &'static str {
        "<http://example.invalid/?page=2>; rel=\"next\""
    }

    fn numbers(found: &AreaIssues) -> Vec<u64> {
        found.issues.iter().map(|issue| issue.number).collect()
    }

    #[test]
    fn a_label_is_read_in_every_state_and_pull_requests_are_left_out() {
        let server = serve(vec![
            Stub::ok(&json!([issue(5, "open", None), pull_request(4)]).to_string())
                .header("Link", next()),
            Stub::ok(&json!([issue(2, "closed", Some("completed")), pull_request(1)]).to_string()),
        ]);
        let (mut service, _) = signed_in(&server);

        let found = service
            .area_issues("MYY-sudo", "TBCE", Some("area:auth"), None)
            .unwrap();

        assert_eq!(
            server.path(0),
            "/repos/MYY-sudo/TBCE/issues?state=all&labels=area%3Aauth&per_page=100&page=1"
        );
        assert!(server.path(1).ends_with("&page=2"));
        assert_eq!(numbers(&found), vec![5, 2]);
        assert_eq!(found.issues[1].state, IssueState::Closed);
        assert!(!found.issues[1].not_planned);
        assert!(!found.truncated);
    }

    #[test]
    fn a_label_and_a_milestone_are_read_apart_and_each_issue_counted_once() {
        let server = serve(vec![
            Stub::ok(&json!([issue(3, "open", None), issue(1, "closed", None)]).to_string()),
            Stub::ok(&json!([issue(3, "open", None), issue(2, "open", None)]).to_string()),
        ]);
        let (mut service, _) = signed_in(&server);

        let found = service
            .area_issues("MYY-sudo", "TBCE", Some("auth"), Some(7))
            .unwrap();

        assert!(server.path(0).contains("&labels=auth&"));
        assert!(!server.path(0).contains("milestone="));
        assert!(server.path(1).contains("&milestone=7&"));
        assert!(!server.path(1).contains("labels="));
        assert_eq!(numbers(&found), vec![3, 2, 1]);
    }

    #[test]
    fn closed_as_not_planned_is_marked() {
        let server = serve(vec![Stub::ok(
            &json!([
                issue(2, "closed", Some("not_planned")),
                issue(1, "open", Some("reopened"))
            ])
            .to_string(),
        )]);
        let (mut service, _) = signed_in(&server);

        let found = service
            .area_issues("MYY-sudo", "TBCE", None, Some(1))
            .unwrap();

        assert!(found.issues[0].not_planned);
        assert!(!found.issues[1].not_planned);
    }

    #[test]
    fn reading_stops_after_five_pages_and_says_so() {
        let page = |number: u64| {
            Stub::ok(&json!([issue(number, "open", None)]).to_string()).header("Link", next())
        };
        let server = serve((1..=6).map(page).collect());
        let (mut service, _) = signed_in(&server);

        let found = service
            .area_issues("MYY-sudo", "TBCE", Some("big"), None)
            .unwrap();

        assert_eq!(server.requests(), 5);
        assert!(found.truncated);
        assert_eq!(found.issues.len(), 5);
    }

    #[test]
    fn nothing_is_sent_without_a_label_or_a_milestone() {
        let server = serve(vec![]);
        let (mut service, _) = signed_in(&server);

        for label in [None, Some("   ")] {
            let found = service
                .area_issues("MYY-sudo", "TBCE", label, None)
                .unwrap();
            assert!(found.issues.is_empty());
        }
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn a_crafted_label_or_milestone_sends_nothing() {
        let server = serve(vec![]);
        let (mut service, _) = signed_in(&server);

        for (label, milestone) in [
            (Some("a,b"), None),
            (Some("tab\there"), None),
            (Some(&*"x".repeat(51)), None),
            (None, Some(0)),
        ] {
            let failure = service
                .area_issues("MYY-sudo", "TBCE", label, milestone)
                .unwrap_err();
            assert_eq!(failure.code, "GITHUB_INVALID_ISSUE", "{label:?}");
        }
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn a_label_cannot_add_a_parameter() {
        let server = serve(vec![Stub::ok("[]")]);
        let (mut service, _) = signed_in(&server);

        service
            .area_issues("MYY-sudo", "TBCE", Some("x&state=open#"), None)
            .unwrap();

        assert_eq!(
            server.path(0),
            "/repos/MYY-sudo/TBCE/issues?state=all&labels=x%26state%3Dopen%23&per_page=100&page=1"
        );
    }

    #[test]
    fn issues_turned_off_are_reported_as_such() {
        let server = serve(vec![Stub::code(
            410,
            r#"{"message":"Issues are disabled"}"#,
        )]);
        let (mut service, _) = signed_in(&server);

        let failure = service
            .area_issues("MYY-sudo", "TBCE", Some("auth"), None)
            .unwrap_err();

        assert_eq!(failure.code, "GITHUB_ISSUES_DISABLED");
    }

    #[test]
    fn a_revoked_token_signs_out() {
        let server = serve(vec![Stub::code(401, r#"{"message":"Bad credentials"}"#)]);
        let (mut service, store) = signed_in(&server);

        let failure = service
            .area_issues("MYY-sudo", "TBCE", Some("auth"), None)
            .unwrap_err();

        assert_eq!(failure.code, "GITHUB_AUTH_FAILED");
        assert_eq!(stored(&store), None);
    }

    #[test]
    fn nothing_writes() {
        let server = serve(vec![
            Stub::ok(&json!([issue(1, "open", None)]).to_string()).header("Link", next()),
            Stub::ok("[]"),
            Stub::ok("[]"),
        ]);
        let (mut service, _) = signed_in(&server);

        service
            .area_issues("MYY-sudo", "TBCE", Some("auth"), Some(2))
            .unwrap();

        assert_eq!(server.requests(), 3);
        for index in 0..3 {
            assert_eq!(server.method(index), "GET");
            assert_eq!(server.json(index), Value::Null);
        }
    }
}
