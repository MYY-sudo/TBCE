//! What the project dashboard reads from GitHub beyond what the panel already has: exact open issue
//! and pull request counts, the open milestones, and the CI state of the commit that is checked out
//! locally. Nothing here writes: every request is a `GET`.

use super::pulls::Checks;
use super::{parse, segment, GitHubService, Page, RateLimit, PER_PAGE};
use crate::filesystem::Result;
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};

/// Open issues and pull requests counted apart, which the repository itself does not report.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub open_pull_requests: u64,
    /// Nothing when issues are turned off or GitHub did not report its combined count.
    pub open_issues: Option<u64>,
    pub issues_disabled: bool,
    pub rate: Option<RateLimit>,
}

/// An open milestone. GitHub's counts include the pull requests assigned to it, not only issues.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Milestone {
    pub number: u64,
    pub title: String,
    pub due_on: Option<String>,
    pub open_issues: u64,
    pub closed_issues: u64,
}

/// The CI state of the local HEAD. Nothing is asked of GitHub when there is no commit yet.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadChecks {
    pub oid: Option<String>,
    pub checks: Option<Checks>,
    pub rate: Option<RateLimit>,
}

#[derive(Deserialize)]
struct MilestoneBody {
    number: u64,
    title: String,
    #[serde(default)]
    due_on: Option<String>,
    #[serde(default)]
    open_issues: u64,
    #[serde(default)]
    closed_issues: u64,
}

impl GitHubService {
    /// Open pull requests are counted from the last page of a one-per-page list, so the count costs
    /// one request however many there are. Open issues are what remains of the repository's combined
    /// count. GitHub updates the two separately, so a moment's disagreement never goes below zero.
    pub fn counts(&mut self, owner: &str, repo: &str) -> Result<Counts> {
        let repository = self.repository(owner, repo)?;
        let path = format!(
            "/repos/{}/{}/pulls?state=open&per_page=1&page=1",
            segment(owner)?,
            segment(repo)?
        );
        let answer = self.get(&path)?;
        let page: Vec<IgnoredAny> = parse(&answer.body)?;
        let open_pull_requests = match answer.last {
            Some(last) => u64::from(last),
            None => page.len() as u64,
        };
        let issues_disabled = repository.has_issues == Some(false);
        Ok(Counts {
            open_pull_requests,
            open_issues: repository
                .open_issues_and_pull_requests
                .filter(|_| !issues_disabled)
                .map(|combined| combined.saturating_sub(open_pull_requests)),
            issues_disabled,
            rate: answer.rate.or(repository.rate),
        })
    }

    /// The first page of open milestones, soonest due first.
    pub fn milestones(&mut self, owner: &str, repo: &str) -> Result<Page<Milestone>> {
        let path = format!(
            "/repos/{}/{}/milestones?state=open&sort=due_on&direction=asc&per_page={PER_PAGE}&page=1",
            segment(owner)?,
            segment(repo)?
        );
        let answer = self.get(&path)?;
        let bodies: Vec<MilestoneBody> = parse(&answer.body)?;
        Ok(Page {
            items: bodies
                .into_iter()
                .map(|body| Milestone {
                    number: body.number,
                    title: body.title,
                    due_on: body.due_on,
                    open_issues: body.open_issues,
                    closed_issues: body.closed_issues,
                })
                .collect(),
            page: 1,
            has_more: answer.has_more,
            rate: answer.rate,
        })
    }

    /// Check runs and statuses for a commit read from the local repository, never from the webview.
    pub fn head_checks(
        &mut self,
        owner: &str,
        repo: &str,
        oid: Option<&str>,
    ) -> Result<HeadChecks> {
        let Some(oid) = oid else {
            return Ok(HeadChecks {
                oid: None,
                checks: None,
                rate: None,
            });
        };
        let base = format!("/repos/{}/{}", segment(owner)?, segment(repo)?);
        let (checks, rate) = self.checks(&base, oid)?;
        Ok(HeadChecks {
            oid: Some(oid.to_string()),
            checks: Some(checks),
            rate,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::mock::*;
    use super::super::pulls::Summary;
    use super::*;
    use serde_json::{json, Value};

    const SHA: &str = "0123456789abcdef0123456789abcdef01234567";

    fn repository(open: u64, has_issues: bool) -> Stub {
        Stub::ok(
            &json!({
                "name": "TBCE",
                "full_name": "MYY-sudo/TBCE",
                "owner": { "login": "MYY-sudo" },
                "open_issues_count": open,
                "has_issues": has_issues
            })
            .to_string(),
        )
    }

    fn last(page: u32) -> String {
        format!(
            "<https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=2>; rel=\"next\", \
             <https://api.github.com/repositories/1/pulls?state=open&per_page=1&page={page}>; rel=\"last\""
        )
    }

    #[test]
    fn open_pull_requests_are_counted_from_the_last_page_and_issues_from_the_rest() {
        let server = serve(vec![
            repository(20, true),
            Stub::ok("[{}]").header("Link", last(7)),
        ]);
        let (mut service, _) = signed_in(&server);

        let counts = service.counts("MYY-sudo", "TBCE").unwrap();

        assert_eq!(server.path(0), "/repos/MYY-sudo/TBCE");
        assert_eq!(
            server.path(1),
            "/repos/MYY-sudo/TBCE/pulls?state=open&per_page=1&page=1"
        );
        assert_eq!(counts.open_pull_requests, 7);
        assert_eq!(counts.open_issues, Some(13));
        assert!(!counts.issues_disabled);
    }

    #[test]
    fn with_no_last_link_the_page_itself_is_the_count() {
        for (body, expected) in [("[]", 0), ("[{}]", 1)] {
            let server = serve(vec![repository(4, true), Stub::ok(body)]);
            let (mut service, _) = signed_in(&server);

            let counts = service.counts("MYY-sudo", "TBCE").unwrap();

            assert_eq!(counts.open_pull_requests, expected, "{body}");
            assert_eq!(counts.open_issues, Some(4 - expected), "{body}");
        }
    }

    #[test]
    fn a_count_that_disagrees_with_the_combined_one_never_goes_below_zero() {
        let server = serve(vec![
            repository(2, true),
            Stub::ok("[{}]").header("Link", last(5)),
        ]);
        let (mut service, _) = signed_in(&server);

        let counts = service.counts("MYY-sudo", "TBCE").unwrap();

        assert_eq!(counts.open_pull_requests, 5);
        assert_eq!(counts.open_issues, Some(0));
    }

    #[test]
    fn issues_turned_off_report_no_issue_count() {
        let server = serve(vec![repository(3, false), Stub::ok("[{}]")]);
        let (mut service, _) = signed_in(&server);

        let counts = service.counts("MYY-sudo", "TBCE").unwrap();

        assert!(counts.issues_disabled);
        assert_eq!(counts.open_issues, None);
        assert_eq!(counts.open_pull_requests, 1);
    }

    #[test]
    fn a_count_survives_an_unchanged_answer() {
        let server = serve(vec![
            repository(10, true).header("ETag", "\"repo\""),
            Stub::ok("[{}]")
                .header("ETag", "\"pulls\"")
                .header("Link", last(6)),
            Stub::code(304, ""),
            Stub::code(304, ""),
        ]);
        let (mut service, _) = signed_in(&server);

        service.counts("MYY-sudo", "TBCE").unwrap();
        let again = service.counts("MYY-sudo", "TBCE").unwrap();

        assert_eq!(
            server.sent(3, "If-None-Match").as_deref(),
            Some("\"pulls\"")
        );
        assert_eq!(again.open_pull_requests, 6, "the cached count was lost");
        assert_eq!(again.open_issues, Some(4));
    }

    #[test]
    fn a_last_link_whose_page_is_not_a_number_is_ignored() {
        let server = serve(vec![
            repository(3, true),
            Stub::ok("[{}]").header(
                "Link",
                "<https://api.github.com/x?per_page=1&page=9x>; rel=\"last\"",
            ),
        ]);
        let (mut service, _) = signed_in(&server);

        let counts = service.counts("MYY-sudo", "TBCE").unwrap();

        assert_eq!(counts.open_pull_requests, 1);
    }

    #[test]
    fn a_revoked_token_during_the_count_signs_out() {
        let server = serve(vec![
            repository(3, true),
            Stub::code(401, r#"{"message":"Bad credentials"}"#),
        ]);
        let (mut service, store) = signed_in(&server);

        let failure = service.counts("MYY-sudo", "TBCE").unwrap_err();

        assert_eq!(failure.code, "GITHUB_AUTH_FAILED");
        assert_eq!(stored(&store), None);
    }

    #[test]
    fn milestones_are_read_soonest_first_with_their_counts() {
        let body = json!([
            { "number": 2, "title": "V1", "due_on": "2026-10-01T07:00:00Z",
              "open_issues": 3, "closed_issues": 9 },
            { "number": 5, "title": "Sonraki sürüm", "due_on": null }
        ]);
        let server = serve(vec![Stub::ok(&body.to_string())
            .header("Link", "<http://example.invalid/?page=2>; rel=\"next\"")]);
        let (mut service, _) = signed_in(&server);

        let page = service.milestones("MYY-sudo", "TBCE").unwrap();

        assert_eq!(
            server.path(0),
            format!(
                "/repos/MYY-sudo/TBCE/milestones?state=open&sort=due_on&direction=asc&per_page={PER_PAGE}&page=1"
            )
        );
        assert!(page.has_more);
        assert_eq!(page.items[0].title, "V1");
        assert_eq!(page.items[0].open_issues, 3);
        assert_eq!(page.items[0].closed_issues, 9);
        assert_eq!(page.items[1].title, "Sonraki sürüm");
        assert_eq!(page.items[1].due_on, None);
        assert_eq!(page.items[1].closed_issues, 0);
    }

    #[test]
    fn the_head_commit_is_checked_with_runs_and_statuses() {
        let server = serve(vec![
            Stub::ok(
                &json!({ "total_count": 1, "check_runs": [
                    { "name": "build", "status": "completed", "conclusion": "success" }
                ] })
                .to_string(),
            ),
            Stub::ok(&json!({ "total_count": 0, "statuses": [] }).to_string()),
        ]);
        let (mut service, _) = signed_in(&server);

        let head = service.head_checks("MYY-sudo", "TBCE", Some(SHA)).unwrap();

        assert!(server
            .path(0)
            .starts_with(&format!("/repos/MYY-sudo/TBCE/commits/{SHA}/check-runs")));
        assert!(server
            .path(1)
            .starts_with(&format!("/repos/MYY-sudo/TBCE/commits/{SHA}/status")));
        let checks = head.checks.expect("checks were not read");
        assert_eq!(checks.summary, Summary::Passing);
        assert!(!checks.missing);
        assert_eq!(head.oid.as_deref(), Some(SHA));
    }

    #[test]
    fn a_commit_github_does_not_have_is_missing_after_one_request() {
        for status in [422, 404] {
            let server = serve(vec![Stub::code(
                status,
                &format!(r#"{{"message":"No commit found for SHA: {SHA}"}}"#),
            )]);
            let (mut service, _) = signed_in(&server);

            let head = service.head_checks("MYY-sudo", "TBCE", Some(SHA)).unwrap();

            let checks = head.checks.expect("checks were not returned");
            assert!(checks.missing, "{status} did not read as missing");
            assert_eq!(checks.summary, Summary::None);
            assert_eq!(server.requests(), 1, "{status} still read the statuses");
        }
    }

    #[test]
    fn no_commit_and_a_crafted_commit_send_nothing_of_their_own() {
        let server = serve(vec![]);
        let (mut service, _) = signed_in(&server);

        let unborn = service.head_checks("MYY-sudo", "TBCE", None).unwrap();
        let crafted = service
            .head_checks("MYY-sudo", "TBCE", Some("../../user"))
            .unwrap();

        assert!(unborn.checks.is_none());
        assert!(crafted.checks.expect("an answer").error.is_some());
        assert_eq!(server.requests(), 0);
    }

    #[test]
    fn nothing_the_dashboard_reads_writes() {
        let server = serve(vec![
            repository(3, true),
            Stub::ok("[]"),
            Stub::ok("[]"),
            Stub::ok(&json!({ "total_count": 0, "check_runs": [] }).to_string()),
            Stub::ok(&json!({ "total_count": 0, "statuses": [] }).to_string()),
        ]);
        let (mut service, _) = signed_in(&server);

        service.counts("MYY-sudo", "TBCE").unwrap();
        service.milestones("MYY-sudo", "TBCE").unwrap();
        service.head_checks("MYY-sudo", "TBCE", Some(SHA)).unwrap();

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
