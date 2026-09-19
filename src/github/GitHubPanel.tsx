import { useEffect } from 'react';
import {
  Activity,
  Archive,
  Check,
  CircleDot,
  Eye,
  GitBranch,
  GitFork,
  Github,
  Lock,
  LogOut,
  RefreshCw,
  Star,
} from 'lucide-react';
import { actions, useGitHub, type GitHubTab } from '../stores/github';
import { useWorkspace } from '../stores/workspace';
import { ask } from '../stores/dialog';
import { IssuesTab } from './IssuesTab';
import { PullRequestsTab } from './PullRequestsTab';
import {
  accountLabel,
  dateLabel,
  rateLabel,
  scopeLabel,
} from '../types/github';
/// The token GitHub needs, named where the user has to create it. Reading needs the read
/// permissions; changing issues needs Issues: Read and write.
const SCOPES =
  'Create a token at github.com/settings/tokens. A fine-grained token needs Metadata, Contents, Issues, Pull requests, Checks and Commit statuses, all Read, or Issues: Read and write to create, close and reopen issues; a classic token needs repo for private repositories, or public_repo for public ones.';
const tabs: { id: GitHubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'branches', label: 'Branches' },
  { id: 'commits', label: 'Commits' },
  { id: 'issues', label: 'Issues' },
  { id: 'pulls', label: 'Pull requests' },
];
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="github-detail">
      <span className="github-label">{label}</span>
      <span className="github-value">{value}</span>
    </div>
  );
}
export function GitHubPanel() {
  const workspace = useWorkspace((s) => s.workspace);
  const workspaceBusy = useWorkspace((s) => s.busy);
  const {
    account,
    link,
    repository,
    branches,
    branchesMore,
    commits,
    commitsMore,
    activity,
    activityDenied,
    activityError,
    rate,
    tab,
    accountBusy,
    dataBusy,
    error,
    notice,
  } = useGitHub();
  const signedIn = account.status === 'signedIn';
  const found = link.status === 'found';
  // Nothing reads GitHub until this panel is on screen. The account read also reports the current
  // rate limit, which is why it runs before the repository rather than being cached forever.
  useEffect(() => {
    void actions.loadAccount();
  }, []);
  useEffect(() => {
    if (signedIn && found && !accountBusy) void actions.refresh();
  }, [signedIn, found, workspace?.id, accountBusy]);
  // Reading a repository must not disable the account controls: a stalled or rate-limited read is
  // exactly when someone wants to disconnect, and blocking that would trap them.
  const busy = accountBusy || dataBusy || workspaceBusy;
  const connect = async () => {
    const token = await ask({
      title: 'Connect GitHub',
      message: SCOPES,
      input: '',
      label: 'Personal access token',
      secret: true,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Connect', value: 'submit' },
      ],
    });
    if (token) void actions.signIn(token);
  };
  return (
    <aside className="explorer github-panel">
      <div className="panel-heading">
        <span>GITHUB</span>
        <span className="panel-tag">
          {signedIn ? (found ? 'CONNECTED' : 'NO REMOTE') : 'NOT CONNECTED'}
        </span>
      </div>
      <div className="github-content">
        {error && (
          <p role="alert" className="stack-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {!signedIn ? (
          <>
            <p className="muted">
              Connect a GitHub account to read the repository behind this
              project. The only thing TBCE changes on GitHub is an issue, and
              only when you create, close or reopen one. The token is kept in
              the Windows Credential Manager rather than in this project.
            </p>
            <p className="muted">{SCOPES}</p>
            <button
              className="primary"
              disabled={accountBusy}
              onClick={() => void connect()}
            >
              Connect account
            </button>
          </>
        ) : (
          <>
            <div className="github-account">
              <span className="github-login">
                <Github size={14} />
                {accountLabel(account)}
              </span>
              <button
                className="icon-button"
                title="Disconnect account"
                aria-label="Disconnect account"
                disabled={accountBusy}
                onClick={() => void actions.signOut()}
              >
                <LogOut size={14} />
              </button>
            </div>
            <p className="github-meta">
              Token scopes: {scopeLabel(account.scopes)}
            </p>
            {!workspace && (
              <p className="muted">
                No folder is open. Open a project to see its repository.
              </p>
            )}
            {workspace && link.status === 'noRepository' && (
              <p className="muted">
                This folder is not a Git repository, so there is no remote to
                follow.
              </p>
            )}
            {workspace && link.status === 'noRemote' && (
              <p className="muted">
                This repository has no remote. Add one with a GitHub URL to see
                its context here.
              </p>
            )}
            {workspace && link.status === 'notGitHub' && (
              <p className="project-warning" role="status">
                The {link.remote} remote points at {link.host || 'somewhere'}{' '}
                rather than github.com. Only GitHub is supported in this
                release.
              </p>
            )}
            {workspace && link.status === 'unavailable' && (
              <p className="project-warning" role="status">
                {link.message} Editing this folder is unaffected.
              </p>
            )}
            {found && (
              <>
                <div className="github-repository">
                  <span className="github-name" title={repository?.fullName}>
                    {link.owner}/{link.repo}
                  </span>
                  <button
                    className="icon-button"
                    title="Refresh"
                    aria-label="Refresh GitHub"
                    disabled={busy}
                    onClick={() => void actions.refresh()}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <div className="github-tabs" role="tablist">
                  {tabs.map((entry) => (
                    <button
                      key={entry.id}
                      role="tab"
                      aria-selected={tab === entry.id}
                      className={tab === entry.id ? 'selected' : ''}
                      onClick={() => actions.setTab(entry.id)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                {!repository ? (
                  <p className="muted github-empty">
                    Nothing read yet. Use Refresh.
                  </p>
                ) : tab === 'overview' ? (
                  <>
                    {repository.description && (
                      <p className="github-description">
                        {repository.description}
                      </p>
                    )}
                    <div className="github-badges">
                      {repository.private && (
                        <span className="github-badge">
                          <Lock size={12} /> private
                        </span>
                      )}
                      {repository.fork && (
                        <span className="github-badge">
                          <GitFork size={12} /> fork
                        </span>
                      )}
                      {repository.archived && (
                        <span className="github-badge">
                          <Archive size={12} /> archived
                        </span>
                      )}
                    </div>
                    <Detail
                      label="Default branch"
                      value={repository.defaultBranch ?? '—'}
                    />
                    <Detail
                      label="Language"
                      value={repository.language ?? '—'}
                    />
                    <Detail
                      label="Last push"
                      value={dateLabel(repository.pushedAt)}
                    />
                    <div className="github-counts">
                      <span title="Stars">
                        <Star size={12} /> {repository.stars ?? '—'}
                      </span>
                      <span title="Forks">
                        <GitFork size={12} /> {repository.forks ?? '—'}
                      </span>
                      <span title="Watchers">
                        <Eye size={12} /> {repository.watchers ?? '—'}
                      </span>
                      <span title="Open issues and pull requests together, as GitHub reports them">
                        <CircleDot size={12} />{' '}
                        {repository.openIssuesAndPullRequests ?? '—'}
                      </span>
                    </div>
                    <p className="github-meta">
                      GitHub counts open issues and pull requests together. The
                      Issues and Pull requests tabs list each on its own.
                    </p>
                    <div className="github-section">
                      ACTIVITY
                      <span>{activity.length}</span>
                    </div>
                    {activityDenied && (
                      <p className="muted github-empty">
                        This token cannot read repository activity. Everything
                        else above is unaffected.
                      </p>
                    )}
                    {activityError && (
                      <p className="project-warning" role="alert">
                        Activity unavailable: {activityError} Use Refresh to try
                        again.
                      </p>
                    )}
                    {!activityDenied && !activityError && !activity.length && (
                      <p className="muted github-empty">
                        No recent activity reported.
                      </p>
                    )}
                    {activity.map((entry, index) => (
                      <div
                        className="github-row"
                        key={`${entry.timestamp ?? index}-${entry.oid ?? index}`}
                      >
                        <Activity size={13} />
                        <span className="github-value">
                          {entry.kind ?? 'activity'}
                          {entry.reference
                            ? ` · ${entry.reference.replace('refs/heads/', '')}`
                            : ''}
                        </span>
                        <span className="github-meta">
                          {entry.actor ?? 'someone'} ·{' '}
                          {dateLabel(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </>
                ) : tab === 'issues' ? (
                  <IssuesTab busy={busy} />
                ) : tab === 'pulls' ? (
                  <PullRequestsTab busy={busy} />
                ) : tab === 'branches' ? (
                  <>
                    <div className="github-section">
                      REMOTE BRANCHES
                      <span>{branches.length}</span>
                    </div>
                    {!branches.length && (
                      <p className="muted github-empty">
                        No branches reported.
                      </p>
                    )}
                    {branches.map((branch) => (
                      <div className="github-row" key={branch.name}>
                        {branch.protected ? (
                          <Check size={13} />
                        ) : (
                          <GitBranch size={13} />
                        )}
                        <span className="github-value" title={branch.name}>
                          {branch.name}
                        </span>
                        {branch.protected && (
                          <span className="github-badge">protected</span>
                        )}
                        <span className="github-oid">
                          {branch.oid.slice(0, 7)}
                        </span>
                      </div>
                    ))}
                    {branchesMore && (
                      <button
                        disabled={busy}
                        onClick={() => void actions.moreBranches()}
                      >
                        Load more branches
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="github-section">
                      COMMITS
                      <span>{commits.length}</span>
                    </div>
                    {!commits.length && (
                      <p className="muted github-empty">No commits reported.</p>
                    )}
                    {commits.map((commit) => (
                      <div className="github-commit" key={commit.oid}>
                        <span className="github-oid">{commit.short}</span>
                        <span className="github-value" title={commit.summary}>
                          {commit.summary}
                        </span>
                        <span className="github-meta">
                          {commit.author ?? commit.login ?? 'unknown'} ·{' '}
                          {dateLabel(commit.date)}
                        </span>
                      </div>
                    ))}
                    {commitsMore && (
                      <button
                        disabled={busy}
                        onClick={() => void actions.moreCommits()}
                      >
                        Load more commits
                      </button>
                    )}
                  </>
                )}
                <p className="github-meta github-rate">{rateLabel(rate)}</p>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
