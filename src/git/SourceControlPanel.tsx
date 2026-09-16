import { useEffect } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  GitBranch,
  GitBranchPlus,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { actions, statKey, useGit } from '../stores/git';
import { useWorkspace } from '../stores/workspace';
import { ask } from '../stores/dialog';
import { headLabel } from '../types/git';
import { fileName, parentPath } from '../types/workspace';
import type { GitChange, GitChangeState } from '../types/git';
/// Git's own single-letter vocabulary, kept because it is what `git status` prints outside TBCE.
const marks: Record<GitChangeState, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  typeChanged: 'T',
};
function ChangeRow({
  path,
  mark,
  originalPath,
  staged,
  disabled,
}: {
  path: string;
  mark: string;
  originalPath: string | null;
  staged: boolean;
  disabled: boolean;
}) {
  const stat = useGit((s) => s.summary[statKey(path, staged)]);
  const selected = useGit(
    (s) => s.selected?.path === path && s.selected.staged === staged,
  );
  const folder = parentPath(path);
  return (
    <div className="scm-row">
      <button
        className={`tree-row ${selected ? 'selected' : ''}`}
        title={originalPath ? `${originalPath} → ${path}` : path}
        disabled={disabled}
        onClick={() => void actions.select(path, staged)}
      >
        <span className="scm-mark">{mark}</span>
        <span>{fileName(path)}</span>
        {folder && <span className="scm-folder">{folder}</span>}
        <span className="scm-stat">
          {stat?.binary
            ? 'BIN'
            : stat && (
                <>
                  {stat.added !== null && (
                    <span className="scm-added">+{stat.added}</span>
                  )}
                  {stat.removed !== null && (
                    <span className="scm-removed">−{stat.removed}</span>
                  )}
                </>
              )}
        </span>
      </button>
      <button
        className="icon-button"
        title={staged ? 'Unstage' : 'Stage'}
        aria-label={`${staged ? 'Unstage' : 'Stage'} ${path}`}
        disabled={disabled}
        onClick={() =>
          void (staged ? actions.unstage([path]) : actions.stage([path]))
        }
      >
        {staged ? <Minus size={14} /> : <Plus size={14} />}
      </button>
    </div>
  );
}
const changeRows = (changes: GitChange[], staged: boolean, disabled: boolean) =>
  changes.map((change) => (
    <ChangeRow
      key={`${staged}:${change.path}`}
      path={change.path}
      mark={marks[change.state]}
      originalPath={change.originalPath}
      staged={staged}
      disabled={disabled}
    />
  ));
export function SourceControlPanel() {
  const workspace = useWorkspace((s) => s.workspace);
  const workspaceBusy = useWorkspace((s) => s.busy);
  // Saving rewrites a file's revision, which is the one editor event that changes what Git reports.
  const revisions = useWorkspace((s) =>
    s.tabs.map((t) => t.revision).join('|'),
  );
  const {
    detection,
    status,
    branches,
    history,
    hasMore,
    message,
    busy,
    error,
    notice,
  } = useGit();
  const found = detection.status === 'found';
  // Nothing reads the repository until this panel is on screen, so opening a folder, switching
  // tabs or alt-tabbing never runs Git in the background. Window focus is handled by the shell.
  useEffect(() => {
    if (found) void actions.refresh();
  }, [found, workspace?.id, revisions]);
  const disabled = busy || workspaceBusy;
  const conflicted = (status?.conflicts.length ?? 0) > 0;
  const untracked: GitChange[] =
    status?.untracked.map((path) => ({
      path,
      originalPath: null,
      state: 'added' as const,
    })) ?? [];
  const create = async () => {
    const name = await ask({
      title: 'New branch',
      message: 'Create a branch at the current commit. It is not checked out.',
      input: '',
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Create', value: 'submit' },
      ],
    });
    if (name) void actions.createBranch(name);
  };
  const initialize = async () => {
    const branch = await ask({
      title: 'Initialize repository',
      message: `Create a Git repository in ${workspace?.name}. Name its first branch, or leave the suggestion.`,
      input: 'main',
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Initialize', value: 'submit' },
      ],
    });
    if (branch) void actions.init(branch);
  };
  const clone = async () => {
    const source = await ask({
      title: 'Clone repository',
      message:
        'Enter the repository to clone. You choose the destination parent folder next.',
      input: '',
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Continue', value: 'submit' },
      ],
    });
    if (!source) return;
    const folder = await ask({
      title: 'Destination folder',
      message: 'Name the folder to create. An existing name is refused.',
      input:
        source
          .replace(/\.git$/, '')
          .split(/[/\\]/)
          .pop() ?? '',
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Clone', value: 'submit' },
      ],
    });
    if (folder) void actions.clone(source, folder);
  };
  return (
    <aside className="explorer scm-panel">
      <div className="panel-heading">
        <span>SOURCE CONTROL</span>
        <span className="panel-tag">{found ? 'GIT' : 'NO REPOSITORY'}</span>
      </div>
      {!workspace ? (
        <div className="explorer-empty">
          <GitBranch size={24} />
          <p>No folder open</p>
          <span>Open a folder to see its repository.</span>
        </div>
      ) : (
        <div className="scm-content">
          {error && (
            <p role="alert" className="stack-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {detection.status === 'none' && (
            <>
              <p className="muted">
                This folder is not a Git repository. TBCE never creates one on
                its own.
              </p>
              <button disabled={disabled} onClick={() => void initialize()}>
                Initialize repository
              </button>
              <button disabled={disabled} onClick={() => void clone()}>
                Clone repository
              </button>
            </>
          )}
          {detection.status === 'parent' && (
            <p className="project-warning" role="status">
              The repository is {detection.root}, above this folder. Open the
              repository root to work with it; status here would describe paths
              relative to a folder you did not open.
            </p>
          )}
          {detection.status === 'unavailable' && (
            <p className="project-warning" role="status">
              {detection.message} Editing this folder is unaffected.
            </p>
          )}
          {found && (
            <>
              <div className="scm-branch">
                <span className="scm-branch-name">
                  <GitBranch size={14} />
                  {headLabel(detection.repository.head)}
                </span>
                <span className="scm-upstream">
                  {status?.upstream ?? 'No upstream'}
                </span>
                {status?.behind !== null && status?.behind !== undefined && (
                  <span className="scm-count">
                    <ArrowDown size={11} />
                    {status.behind}
                  </span>
                )}
                {status?.ahead !== null && status?.ahead !== undefined && (
                  <span className="scm-count">
                    <ArrowUp size={11} />
                    {status.ahead}
                  </span>
                )}
              </div>
              <div className="scm-actions">
                <button
                  disabled={disabled}
                  title="Fetch from the remote"
                  onClick={() => void actions.fetch()}
                >
                  <Download size={13} />
                  Fetch
                </button>
                <button
                  disabled={disabled || !status?.upstream}
                  title={
                    status?.upstream
                      ? 'Fast-forward from the upstream branch'
                      : 'This branch has no upstream to pull from'
                  }
                  onClick={() => void actions.pull()}
                >
                  <ArrowDown size={13} />
                  Pull
                </button>
                <button
                  disabled={disabled}
                  title={
                    status?.upstream
                      ? 'Push to the upstream branch'
                      : 'Publish this branch and set its upstream'
                  }
                  onClick={() => void actions.push()}
                >
                  <Upload size={13} />
                  Push
                </button>
                <button
                  className="icon-button"
                  title="Refresh repository state"
                  aria-label="Refresh repository state"
                  disabled={disabled}
                  onClick={() => void actions.refresh()}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              {conflicted && (
                <>
                  <div className="scm-section">
                    <AlertTriangle size={13} />
                    CONFLICTS
                  </div>
                  {status?.conflicts.map((conflict) => (
                    <p className="stack-error" key={conflict.path}>
                      {conflict.path} ({conflict.state})
                    </p>
                  ))}
                  <p className="muted">
                    Resolve these files, then stage them. Committing is refused
                    until the merge state is clean.
                  </p>
                </>
              )}
              <div className="scm-section">
                STAGED
                <span>{status?.staged.length ?? 0}</span>
              </div>
              {changeRows(status?.staged ?? [], true, disabled)}
              {!status?.staged.length && (
                <p className="muted scm-empty">Nothing staged.</p>
              )}
              <div className="scm-section">
                CHANGES
                <span>{(status?.unstaged.length ?? 0) + untracked.length}</span>
                <button
                  className="icon-button"
                  title="Stage all changes"
                  aria-label="Stage all changes"
                  disabled={
                    disabled || !(status?.unstaged.length || untracked.length)
                  }
                  onClick={() => void actions.stageAll()}
                >
                  <Plus size={14} />
                </button>
              </div>
              {changeRows(status?.unstaged ?? [], false, disabled)}
              {changeRows(untracked, false, disabled)}
              {!status?.unstaged.length && !untracked.length && (
                <p className="muted scm-empty">No local changes.</p>
              )}
              <label className="field scm-message">
                <span>Commit message</span>
                <textarea
                  disabled={disabled}
                  value={message}
                  placeholder="What did you change?"
                  onChange={(e) => actions.setMessage(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={
                  disabled ||
                  !message.trim() ||
                  !status?.staged.length ||
                  conflicted
                }
                title={
                  conflicted
                    ? 'Resolve the conflicts first'
                    : !status?.staged.length
                      ? 'Stage something to commit'
                      : 'Commit the staged changes'
                }
                onClick={() => void actions.commit()}
              >
                <Check size={14} />
                Commit
              </button>
              <div className="scm-section">
                BRANCHES
                <span>{branches?.local.length ?? 0}</span>
                <button
                  className="icon-button"
                  title="New branch"
                  aria-label="New branch"
                  disabled={disabled}
                  onClick={() => void create()}
                >
                  <GitBranchPlus size={14} />
                </button>
              </div>
              {branches?.local.map((branch) => (
                <div className="scm-row" key={branch.name}>
                  <button
                    className={`tree-row ${branch.current ? 'selected' : ''}`}
                    title={
                      branch.current
                        ? 'Current branch'
                        : `Switch to ${branch.name}`
                    }
                    disabled={disabled || branch.current}
                    onClick={() => void actions.checkout(branch.name)}
                  >
                    {branch.current ? (
                      <Check size={13} />
                    ) : (
                      <GitBranch size={13} />
                    )}
                    <span>{branch.name}</span>
                    {branch.gone && <span className="scm-folder">gone</span>}
                    {branch.worktree && !branch.current && (
                      <span className="scm-folder">in use</span>
                    )}
                  </button>
                  <button
                    className="icon-button"
                    title={`Delete ${branch.name}`}
                    aria-label={`Delete ${branch.name}`}
                    disabled={disabled || branch.current}
                    onClick={() => void actions.deleteBranch(branch.name)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="scm-section">
                HISTORY
                <span>{history.length}</span>
              </div>
              {history.map((commit) => (
                <div className="scm-commit" key={commit.oid}>
                  <span className="scm-oid">{commit.shortOid}</span>
                  <span className="scm-summary" title={commit.summary}>
                    {commit.summary}
                  </span>
                  <span className="scm-meta">
                    {commit.author} ·{' '}
                    {new Date(commit.authoredAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
              {!history.length && (
                <p className="muted scm-empty">No commits yet.</p>
              )}
              {hasMore && (
                <button disabled={disabled} onClick={() => void actions.more()}>
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
