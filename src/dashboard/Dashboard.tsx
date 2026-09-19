import { useEffect, type ReactNode } from 'react';
import {
  Activity,
  Archive,
  GitFork,
  Lock,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useWorkspace } from '../stores/workspace';
import { useProject } from '../stores/project';
import { actions as gitActions, useGit } from '../stores/git';
import {
  actions as githubActions,
  useGitHub,
  type GitHubTab,
} from '../stores/github';
import { actions, useDashboard } from '../stores/dashboard';
import { OutcomeIcon } from '../github/PullRequestsTab';
import { RecentProjects } from '../components/RecentProjects';
import { ProgressCard } from './ProgressCard';
import { headLabel } from '../types/git';
import {
  checksLabel,
  dateLabel,
  milestoneProgress,
  type GitHubChecks,
} from '../types/github';
import type { ProjectCommands } from '../types/project';
export type DashboardTarget = 'git' | 'github';
const RECENT = 8;
const commandNames: (keyof ProjectCommands)[] = [
  'install',
  'dev',
  'build',
  'test',
];
function Card({
  title,
  count,
  wide,
  children,
}: {
  title: string;
  count?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`dashboard-card${wide ? ' dashboard-wide' : ''}`}
      aria-label={title}
    >
      <h2 className="github-section">
        {title.toUpperCase()}
        {count !== undefined && <span>{count}</span>}
      </h2>
      {children}
    </section>
  );
}
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="github-detail">
      <span className="github-label">{label}</span>
      <span className="github-value">{value}</span>
    </div>
  );
}
/// A large number with what it counts, or a dash when it is not known.
function Figure({ value, label }: { value: number | null; label: string }) {
  return (
    <p className="dashboard-figure">
      <strong>{value ?? '—'}</strong> {label}
    </p>
  );
}
/// What the Build card says about the checked-out commit, before any check is listed.
function buildLabel(checks: GitHubChecks): string {
  if (checks.missing)
    return 'This commit is not on GitHub yet. Push it for CI to run.';
  return checksLabel(checks);
}
export default function Dashboard({
  onNavigate,
}: {
  onNavigate: (target: DashboardTarget, tab?: GitHubTab) => void;
}) {
  const workspace = useWorkspace((s) => s.workspace);
  const workspaceBusy = useWorkspace((s) => s.busy);
  const project = useProject((s) => s.project);
  const projectDetection = useProject((s) => s.detection);
  const detection = useGit((s) => s.detection);
  const status = useGit((s) => s.status);
  const branches = useGit((s) => s.branches);
  const history = useGit((s) => s.history);
  const gitBusy = useGit((s) => s.busy);
  const {
    account,
    link,
    repository,
    activity,
    activityDenied,
    activityError,
    accountBusy,
    dataBusy,
  } = useGitHub();
  const {
    counts,
    countsDenied,
    countsError,
    milestones,
    milestonesMore,
    milestonesDenied,
    milestonesError,
    head,
    headError,
    busy,
  } = useDashboard();
  const signedIn = account.status === 'signedIn';
  const found = link.status === 'found';
  const connected = signedIn && found;
  const gitFound = detection.status === 'found';
  // Like the GitHub panel, nothing asks GitHub until the dashboard is on screen, and the account
  // read comes first because it is what says whether there is anyone to ask as.
  useEffect(() => {
    void githubActions.loadAccount();
  }, []);
  useEffect(() => {
    if (gitFound) void gitActions.refresh();
  }, [gitFound, workspace?.id]);
  useEffect(() => {
    if (!connected || accountBusy) return;
    void githubActions.refresh();
    void actions.refresh();
  }, [connected, workspace?.id, accountBusy]);
  const working = busy || gitBusy || dataBusy || accountBusy || workspaceBusy;
  const manifest = project?.manifest;
  const changes = status
    ? status.staged.length +
      status.unstaged.length +
      status.untracked.length +
      status.conflicts.length
    : null;
  const headText = status
    ? headLabel(status.repository.head)
    : detection.status === 'found'
      ? headLabel(detection.repository.head)
      : null;
  const gone = branches?.local.filter((branch) => branch.gone) ?? [];
  const connect = (
    <p className="muted github-empty">
      Connect a GitHub account in the GitHub panel to see this.{' '}
      <button className="link-button" onClick={() => onNavigate('github')}>
        Open GitHub
      </button>
    </p>
  );
  const noRemote = (
    <p className="muted github-empty">
      {link.status === 'noRemote'
        ? 'This repository has no remote.'
        : link.status === 'notGitHub'
          ? `The ${link.remote} remote points at ${link.host || 'somewhere'} rather than github.com.`
          : link.status === 'unavailable'
            ? link.message
            : 'This folder is not a Git repository, so there is no remote to follow.'}
    </p>
  );
  // What a GitHub card shows when there is nothing to ask GitHub about.
  const remoteOnly = (content: ReactNode) =>
    !found ? noRemote : !signedIn ? connect : content;
  return (
    <div className="dashboard" aria-label="Project dashboard">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">
            <span className="live-dot" /> PROJECT OVERVIEW
          </span>
          <h1>{manifest?.name ?? workspace?.name ?? 'Project'}</h1>
          <p className="github-meta" title={workspace?.path}>
            {workspace?.path}
          </p>
        </div>
        <button
          disabled={working}
          onClick={() => void actions.refreshAll()}
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>
      <div className="dashboard-grid">
        <Card title="Repository">
          {projectDetection.status === 'invalid' && (
            <p className="project-warning" role="status">
              {projectDetection.message}
            </p>
          )}
          <Detail
            label="Project"
            value={manifest ? manifest.name : 'Not a TBCE project'}
          />
          {manifest?.stack && <Detail label="Stack" value={manifest.stack} />}
          {manifest?.architecture && (
            <Detail label="Architecture" value={manifest.architecture} />
          )}
          {link.status === 'found' ? (
            <Detail label="GitHub" value={`${link.owner}/${link.repo}`} />
          ) : (
            noRemote
          )}
          {connected && repository && (
            <>
              {repository.description && (
                <p className="github-description">{repository.description}</p>
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
            </>
          )}
          {found && !signedIn && connect}
        </Card>
        <Card title="Git state">
          {!gitFound ? (
            <p className="muted github-empty">
              {detection.status === 'parent'
                ? `This folder sits inside the repository at ${detection.root}. Open that folder to see its state.`
                : detection.status === 'unavailable'
                  ? detection.message
                  : 'This folder is not a Git repository.'}
            </p>
          ) : !status ? (
            <p className="muted github-empty">Reading…</p>
          ) : (
            <>
              <Figure
                value={changes}
                label={changes === 1 ? 'changed file' : 'changed files'}
              />
              <Detail label="Staged" value={status.staged.length} />
              <Detail label="Unstaged" value={status.unstaged.length} />
              <Detail label="Untracked" value={status.untracked.length} />
              {status.conflicts.length > 0 && (
                <p className="project-warning" role="status">
                  {status.conflicts.length} conflicted{' '}
                  {status.conflicts.length === 1 ? 'file' : 'files'} to resolve.
                </p>
              )}
              <Detail
                label="Upstream"
                value={
                  status.upstream
                    ? `${status.upstream} · ${status.ahead ?? 0} ahead, ${status.behind ?? 0} behind`
                    : 'No upstream'
                }
              />
              <button className="link-button" onClick={() => onNavigate('git')}>
                Open source control
              </button>
            </>
          )}
        </Card>
        <Card title="Branch">
          {!gitFound ? (
            <p className="muted github-empty">No repository.</p>
          ) : (
            <>
              <p className="dashboard-figure">
                <strong title={headText ?? undefined}>{headText ?? '—'}</strong>
              </p>
              {branches && (
                <>
                  <Detail
                    label="Default"
                    value={branches.defaultBranch ?? '—'}
                  />
                  <Detail label="Local" value={branches.local.length} />
                  <Detail
                    label="Remote-tracking"
                    value={branches.remote.length}
                  />
                </>
              )}
              {gone.length > 0 && (
                <p className="project-warning" role="status">
                  <TriangleAlert size={12} /> Upstream gone for{' '}
                  {gone.map((branch) => branch.name).join(', ')}.
                </p>
              )}
            </>
          )}
        </Card>
        <Card title="Build">
          {remoteOnly(
            !gitFound ? (
              <p className="muted github-empty">No repository.</p>
            ) : headError ? (
              <p className="project-warning" role="alert">
                Checks unavailable: {headError} Use Refresh to try again.
              </p>
            ) : !head ? (
              <p className="muted github-empty">Reading…</p>
            ) : !head.oid || !head.checks ? (
              <p className="muted github-empty">No commits yet.</p>
            ) : (
              <>
                <p
                  className={`github-checks github-${head.checks.missing ? 'none' : head.checks.summary}`}
                  role="status"
                >
                  <OutcomeIcon
                    outcome={head.checks.missing ? 'none' : head.checks.summary}
                  />{' '}
                  {buildLabel(head.checks)}
                </p>
                <p className="github-meta">
                  Commit{' '}
                  <span className="github-oid">{head.oid.slice(0, 7)}</span>
                </p>
                {head.checks.runsDenied && (
                  <p className="muted github-empty">
                    This token cannot read check runs.
                  </p>
                )}
                {head.checks.statusesDenied && (
                  <p className="muted github-empty">
                    This token cannot read commit statuses.
                  </p>
                )}
                {head.checks.error && !head.checks.missing && (
                  <p className="project-warning" role="alert">
                    {head.checks.error}
                  </p>
                )}
                {head.checks.truncated && (
                  <p className="github-meta">
                    GitHub reported more checks than TBCE reads.
                  </p>
                )}
              </>
            ),
          )}
        </Card>
        <Card title="Issues">
          {remoteOnly(
            countsDenied ? (
              <p className="muted github-empty">
                This token cannot count issues.
              </p>
            ) : countsError ? (
              <p className="project-warning" role="alert">
                Counts unavailable: {countsError}
              </p>
            ) : counts?.issuesDisabled ? (
              <p className="muted github-empty">
                Issues are turned off for this repository.
              </p>
            ) : (
              <>
                <Figure value={counts?.openIssues ?? null} label="open" />
                <button
                  className="link-button"
                  onClick={() => onNavigate('github', 'issues')}
                >
                  View issues
                </button>
              </>
            ),
          )}
        </Card>
        <Card title="Pull requests">
          {remoteOnly(
            countsDenied ? (
              <p className="muted github-empty">
                This token cannot count pull requests.
              </p>
            ) : countsError ? (
              <p className="project-warning" role="alert">
                Counts unavailable: {countsError}
              </p>
            ) : (
              <>
                <Figure value={counts?.openPullRequests ?? null} label="open" />
                <button
                  className="link-button"
                  onClick={() => onNavigate('github', 'pulls')}
                >
                  View pull requests
                </button>
              </>
            ),
          )}
        </Card>
        <Card title="Commands">
          {!manifest ? (
            <p className="muted github-empty">
              Not a TBCE project, so no commands are recorded.
            </p>
          ) : (
            <>
              {commandNames.map((name) => (
                <Detail
                  key={name}
                  label={name}
                  value={
                    manifest.commands[name] ? (
                      <code>{manifest.commands[name]}</code>
                    ) : (
                      '—'
                    )
                  }
                />
              ))}
              <p className="github-meta">
                Recorded in the project settings. Running them from here arrives
                with Milestone 13.
              </p>
            </>
          )}
        </Card>
        <Card
          title="Milestones"
          count={connected ? milestones.length : undefined}
        >
          {remoteOnly(
            milestonesDenied ? (
              <p className="muted github-empty">
                This token cannot read milestones.
              </p>
            ) : milestonesError ? (
              <p className="project-warning" role="alert">
                Milestones unavailable: {milestonesError}
              </p>
            ) : !milestones.length ? (
              <p className="muted github-empty">No open milestones.</p>
            ) : (
              <>
                {milestones.map((milestone) => {
                  const progress = milestoneProgress(milestone);
                  const percent =
                    progress === null ? null : Math.round(progress * 100);
                  return (
                    <div className="dashboard-milestone" key={milestone.number}>
                      <div className="github-row">
                        <span className="github-value" title={milestone.title}>
                          {milestone.title}
                        </span>
                        <span className="github-meta">
                          {percent === null
                            ? 'nothing assigned'
                            : `${percent}%`}
                        </span>
                      </div>
                      <div
                        className="dashboard-progress"
                        role="progressbar"
                        aria-label={`${milestone.title} progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent ?? 0}
                      >
                        <span style={{ width: `${percent ?? 0}%` }} />
                      </div>
                      <p className="github-meta">
                        {milestone.closedIssues} closed, {milestone.openIssues}{' '}
                        open · due{' '}
                        {milestone.dueOn
                          ? dateLabel(milestone.dueOn)
                          : 'not set'}
                      </p>
                    </div>
                  );
                })}
                <p className="github-meta">
                  GitHub counts issues and pull requests in a milestone
                  together.
                  {milestonesMore
                    ? ' More open milestones exist than the thirty shown.'
                    : ''}
                </p>
              </>
            ),
          )}
        </Card>
        <Card title="Project progress" wide>
          <ProgressCard
            unavailable={
              !found
                ? 'no GitHub remote'
                : !signedIn
                  ? 'connect a GitHub account'
                  : null
            }
          />
        </Card>
        <Card
          title="Recent commits"
          count={gitFound ? history.length : undefined}
          wide
        >
          {!gitFound ? (
            <p className="muted github-empty">No repository.</p>
          ) : !history.length ? (
            <p className="muted github-empty">No commits yet.</p>
          ) : (
            history.slice(0, RECENT).map((commit) => (
              <div className="github-commit" key={commit.oid}>
                <span className="github-oid">{commit.shortOid}</span>
                <span className="github-value" title={commit.summary}>
                  {commit.summary}
                </span>
                <span className="github-meta">
                  {commit.author} · {dateLabel(commit.authoredAt)}
                </span>
              </div>
            ))
          )}
        </Card>
        <Card title="Recent activity" wide>
          {remoteOnly(
            activityDenied ? (
              <p className="muted github-empty">
                This token cannot read repository activity.
              </p>
            ) : activityError ? (
              <p className="project-warning" role="alert">
                Activity unavailable: {activityError}
              </p>
            ) : !activity.length ? (
              <p className="muted github-empty">No recent activity reported.</p>
            ) : (
              activity.slice(0, RECENT).map((entry, index) => (
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
                    {entry.actor ?? 'someone'} · {dateLabel(entry.timestamp)}
                  </span>
                </div>
              ))
            ),
          )}
        </Card>
      </div>
      <div className="dashboard-recent">
        <RecentProjects />
      </div>
    </div>
  );
}
