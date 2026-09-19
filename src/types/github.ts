export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  /// Unix seconds, as GitHub reports it. The panel formats it; the backend does not guess a locale.
  reset: number;
}
export type GitHubAccount =
  | { status: 'signedOut' }
  | {
      status: 'signedIn';
      login: string;
      name: string | null;
      /// Empty for a fine-grained token: GitHub reports scopes for classic tokens only.
      scopes: string[];
      rate: GitHubRateLimit | null;
    };
/// What the open folder's Git remote says about GitHub. Every variant is a state the panel
/// explains rather than an error, because a folder unrelated to GitHub is perfectly normal.
export type GitHubLink =
  | { status: 'noRepository' }
  | { status: 'noRemote' }
  | { status: 'notGitHub'; remote: string; host: string }
  | { status: 'found'; remote: string; owner: string; repo: string }
  | { status: 'unavailable'; code: string; message: string };
export interface GitHubRepository {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  stars: number | null;
  forks: number | null;
  watchers: number | null;
  /// GitHub counts issues and pull requests together, so the name says so. Separate counts arrive
  /// with the issue and pull request milestones.
  openIssuesAndPullRequests: number | null;
  /// Whether issues are turned on for the repository, or null when GitHub did not say.
  hasIssues: boolean | null;
  pushedAt: string | null;
  language: string | null;
  url: string | null;
  rate: GitHubRateLimit | null;
}
export interface GitHubBranch {
  name: string;
  oid: string;
  protected: boolean;
}
export interface GitHubCommit {
  oid: string;
  short: string;
  summary: string;
  author: string | null;
  login: string | null;
  date: string | null;
}
export interface GitHubActivity {
  kind: string | null;
  reference: string | null;
  actor: string | null;
  oid: string | null;
  timestamp: string | null;
}
/// A page and whether GitHub advertised another one. `hasMore` comes from GitHub's own `Link`
/// header, so a page that happens to be full is not mistaken for a partial one.
export interface GitHubPage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
  rate: GitHubRateLimit | null;
}
export type GitHubIssueState = 'open' | 'closed';
/// Why an issue is closed. The backend accepts these two and nothing else.
export type GitHubCloseReason = 'completed' | 'notPlanned';
export interface GitHubLabel {
  name: string;
  /// Six hexadecimal digits, checked by the backend before it reaches a style, or null.
  color: string | null;
}
export interface GitHubIssue {
  number: number;
  title: string;
  state: GitHubIssueState;
  /// `completed`, `not_planned` or `reopened`, as GitHub reports it.
  stateReason: string | null;
  author: string | null;
  labels: GitHubLabel[];
  assignees: string[];
  milestone: { number: number; title: string } | null;
  comments: number;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
}
/// One issue with its body. The body is shown as written, never interpreted as markup.
export interface GitHubIssueDetail extends GitHubIssue {
  body: string | null;
  rate: GitHubRateLimit | null;
}
/// What the filters and the new-issue form can offer. GitHub models stay here, apart from the
/// generic TBCE types.
export interface GitHubIssueChoices {
  labels: (GitHubLabel & { description: string | null })[];
  assignees: string[];
  milestones: { number: number; title: string; dueOn: string | null }[];
  /// At least one list stopped at its page limit.
  truncated: boolean;
  rate: GitHubRateLimit | null;
}
export interface GitHubIssueFilter {
  state: GitHubIssueState;
  label: string | null;
  /// A login, or `none` for issues nobody is assigned to.
  assignee: string | null;
  /// A milestone number, or `none` for issues without one.
  milestone: string | null;
}
export interface GitHubIssueDraft {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  milestone: number | null;
}
/// What GitHub silently left out of a new issue, which it does for someone without push access.
export interface GitHubIssueDropped {
  labels: string[];
  assignees: string[];
  milestone: boolean;
}
export interface GitHubIssueCreated {
  issue: GitHubIssueDetail;
  dropped: GitHubIssueDropped;
}
/// Whether an issue belongs in a list filtered this way. Used after a change, so an issue that
/// no longer matches leaves the list without another request.
export const matchesFilter = (
  issue: GitHubIssue,
  filter: GitHubIssueFilter,
): boolean => {
  if (issue.state !== filter.state) return false;
  if (
    filter.label &&
    !issue.labels.some(
      (label) => label.name.toLowerCase() === filter.label!.toLowerCase(),
    )
  )
    return false;
  if (filter.assignee === 'none' && issue.assignees.length) return false;
  if (
    filter.assignee &&
    filter.assignee !== 'none' &&
    !issue.assignees.some(
      (login) => login.toLowerCase() === filter.assignee!.toLowerCase(),
    )
  )
    return false;
  if (filter.milestone === 'none' && issue.milestone) return false;
  if (
    filter.milestone &&
    filter.milestone !== 'none' &&
    String(issue.milestone?.number) !== filter.milestone
  )
    return false;
  return true;
};
/// How an issue's state reads, including the reason GitHub recorded for closing it.
export const issueStateLabel = (issue: GitHubIssue): string =>
  issue.state === 'open'
    ? 'Open'
    : issue.stateReason === 'not_planned'
      ? 'Closed as not planned'
      : 'Closed';
/// What GitHub left out of a new issue, as a sentence, or null when it applied everything.
export const droppedLabel = (dropped: GitHubIssueDropped): string | null => {
  const parts = [
    ...(dropped.labels.length ? [`labels ${dropped.labels.join(', ')}`] : []),
    ...(dropped.assignees.length
      ? [`assignees ${dropped.assignees.join(', ')}`]
      : []),
    ...(dropped.milestone ? ['the milestone'] : []),
  ];
  return parts.length
    ? `GitHub created the issue without ${parts.join(', ')}. Only people with push access can set these.`
    : null;
};
/// The account line the panel shows. A token GitHub accepted without reporting a name is normal.
export const accountLabel = (account: GitHubAccount): string =>
  account.status === 'signedIn'
    ? account.name
      ? `${account.name} (${account.login})`
      : account.login
    : 'Not connected';
/// Scopes are reported for classic tokens only, so their absence is explained rather than shown
/// as an empty list.
export const scopeLabel = (scopes: string[]): string =>
  scopes.length ? scopes.join(', ') : 'not reported for this token';
/// An ISO timestamp as a plain date, or a dash when GitHub reported none.
export const dateLabel = (value: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};
/// What is left of the hourly allowance, and when it comes back.
export const rateLabel = (rate: GitHubRateLimit | null): string =>
  rate
    ? `${rate.remaining} of ${rate.limit} requests left, resetting ${new Date(
        rate.reset * 1000,
      ).toLocaleTimeString()}`
    : 'Rate limit not reported';
export type GitHubPullState = 'open' | 'closed';
export interface GitHubPullRequest {
  number: number;
  title: string;
  state: GitHubPullState;
  draft: boolean;
  /// GitHub reports a merged pull request as closed, so this is what tells the two apart.
  merged: boolean;
  author: string | null;
  head: {
    reference: string;
    /// `owner:branch`, as GitHub labels it.
    label: string | null;
    sha: string;
    /// The repository the branch lives in, or null when that fork has been deleted.
    repository: string | null;
  };
  base: { reference: string };
  /// The branch lives in another repository than the one it targets, or in a deleted fork.
  crossRepository: boolean;
  labels: GitHubLabel[];
  assignees: string[];
  /// Requested reviewers: logins, then team names.
  reviewers: string[];
  milestone: { number: number; title: string } | null;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  mergedAt: string | null;
}
export type GitHubCheckOutcome = 'passing' | 'failing' | 'pending' | 'neutral';
export interface GitHubCheck {
  name: string;
  /// A Checks API run, or a commit status reported the older way.
  source: 'run' | 'status';
  outcome: GitHubCheckOutcome;
  /// GitHub's own word for where it stands.
  state: string;
  description: string | null;
}
/// The CI state of a pull request's head commit. A refusal or failure here is part of the answer,
/// because the pull request itself was read fine.
export interface GitHubChecks {
  summary: 'passing' | 'failing' | 'pending' | 'none';
  entries: GitHubCheck[];
  truncated: boolean;
  runsDenied: boolean;
  statusesDenied: boolean;
  /// GitHub does not have the commit, which for a local commit usually means it is not pushed.
  missing: boolean;
  error: string | null;
}
/// One pull request with its description, shown as written and never interpreted as markup.
export interface GitHubPullRequestDetail extends GitHubPullRequest {
  body: string | null;
  commits: number | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  comments: number | null;
  reviewComments: number | null;
  /// Null until GitHub has worked it out, which it does in the background.
  mergeable: boolean | null;
  mergeableState: string | null;
  checks: GitHubChecks;
  rate: GitHubRateLimit | null;
}
export interface GitHubPullFile {
  path: string;
  previousPath: string | null;
  /// `added`, `removed`, `modified`, `renamed`, `copied`, `changed` or `unchanged`.
  status: string;
  additions: number;
  deletions: number;
  /// GitHub leaves the patch out for binary files and for very large ones.
  patch: string | null;
}
/// GitHub lists at most this many changed files for one pull request.
export const PULL_FILES_MAX = 3000;
/// How a pull request's state reads. Merged and draft are told apart from plain closed and open.
export const pullStateLabel = (pull: GitHubPullRequest): string =>
  pull.merged
    ? 'Merged'
    : pull.state === 'closed'
      ? 'Closed'
      : pull.draft
        ? 'Draft'
        : 'Open';
/// Where a pull request's branch comes from, naming the fork when it is not this repository.
export const sourceLabel = (pull: GitHubPullRequest): string =>
  !pull.crossRepository
    ? pull.head.reference
    : pull.head.repository
      ? `${pull.head.repository}:${pull.head.reference}`
      : `${pull.head.reference} (deleted fork)`;
/// The CI state as a sentence.
export const checksLabel = (checks: GitHubChecks): string => {
  const count = checks.entries.length;
  const failing = checks.entries.filter((c) => c.outcome === 'failing').length;
  const pending = checks.entries.filter((c) => c.outcome === 'pending').length;
  switch (checks.summary) {
    case 'failing':
      return `${failing} of ${count} checks failing`;
    case 'pending':
      return `${pending} of ${count} checks pending`;
    case 'passing': {
      const neutral = checks.entries.filter(
        (c) => c.outcome === 'neutral',
      ).length;
      return neutral
        ? `${count - neutral} passed, ${neutral} skipped or neutral`
        : `All ${count} checks passed`;
    }
    default:
      return 'No checks reported';
  }
};
/// Whether GitHub thinks the branch merges cleanly, including when it has not decided yet.
export const mergeableLabel = (detail: GitHubPullRequestDetail): string => {
  if (detail.merged || detail.state === 'closed') return '—';
  if (detail.mergeable === null) return 'Not yet known';
  if (!detail.mergeable) return 'Has conflicts';
  return detail.mergeableState === 'blocked'
    ? 'Blocked by branch rules'
    : detail.mergeableState === 'behind'
      ? 'Behind the target branch'
      : 'No conflicts';
};
/// Open issues and pull requests counted apart, for the dashboard.
export interface GitHubCounts {
  openPullRequests: number;
  /// Null when issues are turned off or GitHub did not report its combined count.
  openIssues: number | null;
  issuesDisabled: boolean;
  rate: GitHubRateLimit | null;
}
/// An open milestone. GitHub's counts include pull requests assigned to it, not only issues.
export interface GitHubMilestone {
  number: number;
  title: string;
  dueOn: string | null;
  openIssues: number;
  closedIssues: number;
}
/// The CI state of the commit checked out locally. `oid` is null on a branch with no commits.
export interface GitHubHeadChecks {
  oid: string | null;
  checks: GitHubChecks | null;
  rate: GitHubRateLimit | null;
}
/// An issue that belongs to a progress area. Pull requests are left out before it gets here.
export interface GitHubAreaIssue {
  number: number;
  title: string;
  state: GitHubIssueState;
  /// Closed as not planned, which progress leaves out rather than counting as done.
  notPlanned: boolean;
}
/// The issues carrying an area's label and those in its milestone, each once.
export interface GitHubAreaIssues {
  issues: GitHubAreaIssue[];
  /// GitHub had more than the five hundred read for the label or the milestone.
  truncated: boolean;
  rate: GitHubRateLimit | null;
}
/// How much of a milestone is closed, from 0 to 1, or null when nothing is assigned to it.
export const milestoneProgress = (
  milestone: GitHubMilestone,
): number | null => {
  const total = milestone.openIssues + milestone.closedIssues;
  return total ? milestone.closedIssues / total : null;
};
