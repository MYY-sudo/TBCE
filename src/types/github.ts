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
