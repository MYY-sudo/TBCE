import {
  ArrowLeft,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from 'lucide-react';
import { actions, useGitHub } from '../stores/github';
import { Labels } from './IssuesTab';
import {
  PULL_FILES_MAX,
  checksLabel,
  dateLabel,
  mergeableLabel,
  pullStateLabel,
  sourceLabel,
  type GitHubCheckOutcome,
  type GitHubPullFile,
  type GitHubPullRequest,
} from '../types/github';
function StateIcon({ pull }: { pull: GitHubPullRequest }) {
  if (pull.merged) return <GitMerge size={13} className="github-merged" />;
  if (pull.state === 'closed') return <GitPullRequestClosed size={13} />;
  if (pull.draft) return <GitPullRequestDraft size={13} />;
  return <GitPullRequest size={13} />;
}
export function OutcomeIcon({
  outcome,
}: {
  outcome: GitHubCheckOutcome | 'none';
}) {
  switch (outcome) {
    case 'passing':
      return <CircleCheck size={13} />;
    case 'failing':
      return <CircleX size={13} />;
    case 'pending':
      return <CircleDashed size={13} />;
    default:
      return <CircleMinus size={13} />;
  }
}
/// One letter per change, as Git's own status output uses.
const statusLetter: Record<string, string> = {
  added: 'A',
  removed: 'D',
  modified: 'M',
  renamed: 'R',
  copied: 'C',
  changed: 'T',
  unchanged: '·',
};
function FileRow({ file, busy }: { file: GitHubPullFile; busy: boolean }) {
  const open = useGitHub((state) => state.pullFile?.file.path === file.path);
  const name = file.previousPath
    ? `${file.previousPath} → ${file.path}`
    : file.path;
  return (
    <button
      className={`github-file${open ? ' selected' : ''}`}
      disabled={busy}
      title={`${file.status}: ${name}`}
      onClick={() => actions.openPullFile(file)}
    >
      <span className="github-oid">{statusLetter[file.status] ?? '?'}</span>
      <span className="github-value">{name}</span>
      <span className="scm-added">+{file.additions}</span>
      <span className="scm-removed">−{file.deletions}</span>
    </button>
  );
}
function PullView({ busy }: { busy: boolean }) {
  const { selectedPull, pullFiles, pullFilesMore, pullFilesError } =
    useGitHub();
  const pull = selectedPull!;
  const checks = pull.checks;
  const count = (value: number | null) => value ?? '—';
  return (
    <>
      <button
        className="github-back"
        disabled={busy}
        onClick={() => actions.backToPulls()}
      >
        <ArrowLeft size={13} /> Back to pull requests
      </button>
      <h3 className="github-issue-heading">
        {pull.title} <span className="github-oid">#{pull.number}</span>
      </h3>
      <div className="github-badges">
        <span className={`github-badge${pull.merged ? ' github-merged' : ''}`}>
          <StateIcon pull={pull} /> {pullStateLabel(pull)}
        </span>
      </div>
      <p className="github-meta">
        Opened by {pull.author ?? 'someone'} · {dateLabel(pull.createdAt)}
        {pull.mergedAt
          ? ` · merged ${dateLabel(pull.mergedAt)}`
          : pull.closedAt
            ? ` · closed ${dateLabel(pull.closedAt)}`
            : ''}
      </p>
      <div className="github-detail">
        <span className="github-label">Source</span>
        <span className="github-value">{sourceLabel(pull)}</span>
      </div>
      <div className="github-detail">
        <span className="github-label">Target</span>
        <span className="github-value">{pull.base.reference}</span>
      </div>
      <Labels labels={pull.labels} />
      <div className="github-detail">
        <span className="github-label">Assignees</span>
        <span className="github-value">
          {pull.assignees.length ? pull.assignees.join(', ') : 'Nobody'}
        </span>
      </div>
      <div className="github-detail">
        <span className="github-label">Reviewers</span>
        <span className="github-value">
          {pull.reviewers.length ? pull.reviewers.join(', ') : 'None requested'}
        </span>
      </div>
      <div className="github-detail">
        <span className="github-label">Milestone</span>
        <span className="github-value">{pull.milestone?.title ?? 'None'}</span>
      </div>
      <div className="github-detail">
        <span className="github-label">Mergeable</span>
        <span className="github-value">{mergeableLabel(pull)}</span>
      </div>
      <div className="github-counts">
        <span>{count(pull.commits)} commits</span>
        <span className="scm-added">+{count(pull.additions)}</span>
        <span className="scm-removed">−{count(pull.deletions)}</span>
        <span>{count(pull.changedFiles)} files</span>
        <span>
          {(pull.comments ?? 0) + (pull.reviewComments ?? 0)} comments
        </span>
      </div>
      <pre className="github-body">
        {pull.body?.trim() ? pull.body : 'No description provided.'}
      </pre>
      <div className="github-section">
        CHECKS
        <span>{checks.entries.length}</span>
      </div>
      <p className={`github-checks github-${checks.summary}`} role="status">
        <OutcomeIcon outcome={checks.summary} /> {checksLabel(checks)}
      </p>
      {checks.runsDenied && (
        <p className="muted github-empty">
          This token cannot read check runs. A fine-grained token needs Checks:
          Read.
        </p>
      )}
      {checks.statusesDenied && (
        <p className="muted github-empty">
          This token cannot read commit statuses. A fine-grained token needs
          Commit statuses: Read.
        </p>
      )}
      {checks.error && (
        <p className="project-warning" role="alert">
          Checks unavailable: {checks.error} Use Refresh to try again.
        </p>
      )}
      {checks.entries.map((check, index) => (
        <div
          className={`github-row github-${check.outcome}`}
          key={`${check.source}-${check.name}-${index}`}
          title={check.description ?? undefined}
        >
          <OutcomeIcon outcome={check.outcome} />
          <span className="github-value">{check.name}</span>
          <span className="github-meta">{check.state.replace(/_/g, ' ')}</span>
        </div>
      ))}
      {checks.truncated && (
        <p className="github-meta">
          GitHub reported more checks than TBCE reads; the summary covers the
          ones listed.
        </p>
      )}
      <div className="github-section">
        CHANGED FILES
        <span>{pullFiles.length}</span>
      </div>
      {pullFilesError && (
        <p className="project-warning" role="alert">
          Changed files unavailable: {pullFilesError} Use Refresh to try again.
        </p>
      )}
      {!pullFilesError && !pullFiles.length && (
        <p className="muted github-empty">No changed files reported.</p>
      )}
      {pullFiles.map((file) => (
        <FileRow key={file.path} file={file} busy={busy} />
      ))}
      {pullFilesMore && (
        <button disabled={busy} onClick={() => void actions.moreFiles()}>
          Load more files
        </button>
      )}
      {(pull.changedFiles ?? 0) > PULL_FILES_MAX && (
        <p className="github-meta">
          GitHub lists at most {PULL_FILES_MAX} changed files for one pull
          request, so some cannot be shown here.
        </p>
      )}
      <p className="github-meta">
        Creating, reviewing and merging pull requests are not part of this
        release.
      </p>
    </>
  );
}
export function PullRequestsTab({ busy }: { busy: boolean }) {
  const { pulls, pullsMore, pullsDenied, pullsError, pullState, selectedPull } =
    useGitHub();
  if (selectedPull) return <PullView busy={busy} />;
  return (
    <>
      <div className="github-issue-bar">
        <div
          className="github-segment"
          role="group"
          aria-label="Pull request state"
        >
          {(['open', 'closed'] as const).map((state) => (
            <button
              key={state}
              aria-pressed={pullState === state}
              className={pullState === state ? 'selected' : ''}
              disabled={busy}
              onClick={() =>
                pullState !== state && void actions.setPullState(state)
              }
            >
              {state === 'open' ? 'Open' : 'Closed'}
            </button>
          ))}
        </div>
      </div>
      <div className="github-section">
        {pullState === 'open' ? 'OPEN PULL REQUESTS' : 'CLOSED PULL REQUESTS'}
        <span>{pulls.length}</span>
      </div>
      {pullsDenied && (
        <p className="muted github-empty">
          This token cannot read pull requests. A fine-grained token needs Pull
          requests: Read access; everything else in this panel is unaffected.
        </p>
      )}
      {pullsError && (
        <p className="project-warning" role="alert">
          Pull requests unavailable: {pullsError} Use Refresh to try again.
        </p>
      )}
      {!pullsDenied && !pullsError && !pulls.length && (
        <p className="muted github-empty">
          {pullState === 'open'
            ? 'No open pull requests.'
            : 'No closed pull requests.'}
        </p>
      )}
      {pulls.map((pull) => (
        <button
          className="github-issue"
          key={pull.number}
          disabled={busy}
          onClick={() => void actions.openPull(pull.number)}
        >
          <StateIcon pull={pull} />
          <span className="github-issue-title">{pull.title}</span>
          <span className="github-meta">
            #{pull.number} · {pull.author ?? 'someone'} · {pullStateLabel(pull)}{' '}
            · {dateLabel(pull.createdAt)}
          </span>
          <span className="github-meta">
            {sourceLabel(pull)} → {pull.base.reference}
          </span>
          <Labels labels={pull.labels} />
        </button>
      ))}
      {pullsMore && (
        <button disabled={busy} onClick={() => void actions.morePulls()}>
          Load more pull requests
        </button>
      )}
    </>
  );
}
