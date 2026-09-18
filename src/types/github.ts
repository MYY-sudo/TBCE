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
