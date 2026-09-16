import { beforeEach, expect, test, vi } from 'vitest';
import { actions, PAGE, statKey, useGit } from '../src/stores/git';
import { useWorkspace } from '../src/stores/workspace';
import { git } from '../src/services/git';
import { fileSystem } from '../src/services/filesystem';
import { headLabel } from '../src/types/git';
import type {
  GitBranches,
  GitCommit,
  GitFileDiff,
  GitRepository,
  GitStatus,
} from '../src/types/git';
vi.mock('../src/services/git', () => ({
  git: {
    detect: vi.fn(),
    init: vi.fn(),
    status: vi.fn(),
    branches: vi.fn(),
    stage: vi.fn(),
    stageAll: vi.fn(),
    unstage: vi.fn(),
    commit: vi.fn(),
    createBranch: vi.fn(),
    checkoutBranch: vi.fn(),
    deleteBranch: vi.fn(),
    history: vi.fn(),
    diff: vi.fn(),
    diffSummary: vi.fn(),
    clone: vi.fn(),
    fetch: vi.fn(),
    pull: vi.fn(),
    push: vi.fn(),
  },
}));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: { list: vi.fn(), chooseWorkspace: vi.fn() },
}));
vi.mock('../src/services/project', () => ({
  projects: { detect: vi.fn().mockResolvedValue({ status: 'none' }) },
}));
vi.mock('../src/stores/dialog', () => ({ ask: vi.fn() }));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const repository: GitRepository = {
  root: 'C:/code/app',
  gitDir: 'C:/code/app/.git',
  commonDir: 'C:/code/app/.git',
  linkedWorktree: false,
  bare: false,
  head: { kind: 'branch', name: 'main', oid: 'abc1234def' },
};
const status: GitStatus = {
  repository,
  branch: 'main',
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
};
const branches: GitBranches = {
  current: 'main',
  detached: false,
  defaultBranch: 'main',
  local: [
    {
      name: 'main',
      oid: 'abc1234def',
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
      gone: false,
      current: true,
      worktree: null,
      remote: false,
    },
  ],
  remote: [],
};
const commit: GitCommit = {
  oid: 'abc1234def',
  shortOid: 'abc1234',
  parents: [],
  author: 'Owner',
  email: 'owner@example.com',
  authoredAt: '2026-09-16T10:00:00+03:00',
  committedAt: '2026-09-16T10:00:00+03:00',
  summary: 'feat: add the panel',
  refs: [],
};
const fileDiff: GitFileDiff = {
  path: 'src/app.ts',
  originalPath: null,
  staged: false,
  binary: false,
  truncated: false,
  added: 2,
  removed: 1,
  patch: '@@ -1 +1,2 @@\n-a\n+b\n+c\n',
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useGit.setState(useGit.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
});
/// Opens a workspace whose repository is found and idle, which is where the panel starts.
async function open() {
  vi.mocked(git.detect).mockResolvedValue({ status: 'found', repository });
  vi.mocked(git.status).mockResolvedValue(status);
  vi.mocked(git.branches).mockResolvedValue(branches);
  vi.mocked(git.history).mockResolvedValue({
    commits: [],
    skip: 0,
    hasMore: false,
  });
  vi.mocked(git.diffSummary).mockResolvedValue([]);
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGit.getState().detection.status).toBe('found'),
  );
  await vi.waitFor(() => expect(useGit.getState().busy).toBe(false));
}

test('opening a workspace detects its repository', async () => {
  vi.mocked(git.detect).mockResolvedValue({ status: 'found', repository });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGit.getState().detection.status).toBe('found'),
  );
  expect(git.detect).toHaveBeenCalledWith('1');
  expect(useGit.getState().busy).toBe(false);
});

test('detection alone runs no other Git command', async () => {
  vi.mocked(git.detect).mockResolvedValue({ status: 'found', repository });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGit.getState().detection.status).toBe('found'),
  );
  // Nothing reads the repository until the panel asks, so opening a folder never waits on status.
  expect(git.status).not.toHaveBeenCalled();
  expect(git.branches).not.toHaveBeenCalled();
  expect(git.history).not.toHaveBeenCalled();
});

test('a folder without a repository is a normal state, not an error', async () => {
  vi.mocked(git.detect).mockResolvedValue({ status: 'none' });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() => expect(git.detect).toHaveBeenCalled());
  expect(useGit.getState().detection).toEqual({ status: 'none' });
  expect(useGit.getState().error).toBeNull();
});

test('a repository above the workspace is reported as a parent', async () => {
  vi.mocked(git.detect).mockResolvedValue({
    status: 'parent',
    root: 'C:/code',
  });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGit.getState().detection.status).toBe('parent'),
  );
});

test('a missing Git installation is reported without losing the workspace', async () => {
  vi.mocked(git.detect).mockResolvedValue({
    status: 'unavailable',
    code: 'GIT_MISSING',
    message: 'Git was not found. Install Git and restart TBCE.',
  });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGit.getState().detection.status).toBe('unavailable'),
  );
  // The workspace is untouched: a broken Git never costs the user their open folder.
  expect(useWorkspace.getState().workspace).toEqual(workspace);
});

test('a failed detection reports its message and claims no repository', async () => {
  vi.mocked(git.detect).mockRejectedValue({
    code: 'INTERNAL',
    message: 'Git service is unavailable.',
  });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGit.getState().error).toBe('Git service is unavailable.'),
  );
  expect(useGit.getState().detection).toEqual({ status: 'none' });
  actions.dismissError();
  expect(useGit.getState().error).toBeNull();
});

test('an answer for a replaced workspace is discarded', async () => {
  let resolveFirst!: (value: {
    status: 'found';
    repository: GitRepository;
  }) => void;
  vi.mocked(git.detect).mockImplementationOnce(
    () => new Promise((resolve) => (resolveFirst = resolve)),
  );
  useWorkspace.setState({ workspace });
  await vi.waitFor(() => expect(git.detect).toHaveBeenCalledTimes(1));

  // The user opens a different folder before the first detection answers.
  vi.mocked(git.detect).mockResolvedValue({ status: 'none' });
  useWorkspace.setState({ workspace: { ...workspace, id: '2' } });
  await vi.waitFor(() => expect(git.detect).toHaveBeenCalledTimes(2));
  resolveFirst({ status: 'found', repository });

  await vi.waitFor(() => expect(useGit.getState().busy).toBe(false));
  expect(useGit.getState().detection).toEqual({ status: 'none' });
});

test('the head label names a branch, an unborn branch and a detached head', () => {
  expect(headLabel({ kind: 'branch', name: 'main', oid: 'abc' })).toBe('main');
  expect(headLabel({ kind: 'unborn', branch: 'main' })).toBe(
    'main (no commits yet)',
  );
  expect(headLabel({ kind: 'detached', oid: 'abc1234def567' })).toBe(
    'detached at abc1234',
  );
});

test('refreshing reads status, branches, history and both diff summaries', async () => {
  await open();
  vi.mocked(git.diffSummary).mockImplementation((_id, staged) =>
    Promise.resolve([
      {
        path: 'src/app.ts',
        originalPath: null,
        added: staged ? 9 : 2,
        removed: 1,
        binary: false,
      },
    ]),
  );
  expect(await actions.refresh()).toBe(true);
  const state = useGit.getState();
  expect(state.status).toEqual(status);
  expect(state.branches).toEqual(branches);
  // The index and the working tree are separate answers, so one path carries two counts.
  expect(state.summary[statKey('src/app.ts', false)]?.added).toBe(2);
  expect(state.summary[statKey('src/app.ts', true)]?.added).toBe(9);
});

test('a late status answer for a replaced workspace is discarded', async () => {
  await open();
  let release!: (value: GitStatus) => void;
  vi.mocked(git.status).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const pending = actions.refresh();
  useWorkspace.setState({ workspace: { ...workspace, id: '2' } });
  release(status);
  expect(await pending).toBe(false);
  expect(useGit.getState().status).toBeNull();
});

test('a second operation started while one runs is refused', async () => {
  await open();
  let release!: (value: GitStatus) => void;
  vi.mocked(git.status).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const pending = actions.refresh();
  expect(await actions.stage(['src/app.ts'])).toBe(false);
  expect(git.stage).not.toHaveBeenCalled();
  release(status);
  expect(await pending).toBe(true);
});

test('staging writes the returned status without rereading branches or history', async () => {
  await open();
  await actions.refresh();
  vi.mocked(git.branches).mockClear();
  vi.mocked(git.history).mockClear();
  const afterStaging = {
    ...status,
    staged: [
      { path: 'src/app.ts', originalPath: null, state: 'modified' as const },
    ],
  };
  vi.mocked(git.stage).mockResolvedValue(afterStaging);
  expect(await actions.stage(['src/app.ts'])).toBe(true);
  expect(git.stage).toHaveBeenCalledWith('1', ['src/app.ts']);
  expect(useGit.getState().status).toEqual(afterStaging);
  // Staging cannot change which branches exist or what has been committed.
  expect(git.branches).not.toHaveBeenCalled();
  expect(git.history).not.toHaveBeenCalled();
});

test('unstaging and staging everything go through the service', async () => {
  await open();
  vi.mocked(git.unstage).mockResolvedValue(status);
  vi.mocked(git.stageAll).mockResolvedValue(status);
  await actions.unstage(['src/app.ts']);
  expect(git.unstage).toHaveBeenCalledWith('1', ['src/app.ts']);
  await actions.stageAll();
  expect(git.stageAll).toHaveBeenCalledWith('1');
});

test('committing clears the message and rereads the repository', async () => {
  await open();
  actions.setMessage('feat: add the panel');
  vi.mocked(git.commit).mockResolvedValue(commit);
  vi.mocked(git.history).mockResolvedValue({
    commits: [commit],
    skip: 0,
    hasMore: false,
  });
  expect(await actions.commit()).toBe(true);
  expect(git.commit).toHaveBeenCalledWith('1', 'feat: add the panel');
  expect(useGit.getState().message).toBe('');
  expect(useGit.getState().history).toEqual([commit]);
});

test('a refused commit keeps the message and explains why', async () => {
  await open();
  actions.setMessage('feat: add the panel');
  vi.mocked(git.commit).mockRejectedValue({
    code: 'GIT_NO_IDENTITY',
    message: 'Set user.name and user.email before committing.',
  });
  expect(await actions.commit()).toBe(false);
  expect(useGit.getState().error).toBe(
    'Set user.name and user.email before committing.',
  );
  // Losing a written message because Git refused the commit would be its own failure.
  expect(useGit.getState().message).toBe('feat: add the panel');
});

test('history paging appends the next page', async () => {
  await open();
  const second = { ...commit, oid: 'def', shortOid: 'def5678' };
  vi.mocked(git.history).mockResolvedValue({
    commits: [commit],
    skip: 0,
    hasMore: true,
  });
  await actions.refresh();
  expect(useGit.getState().hasMore).toBe(true);
  vi.mocked(git.history).mockResolvedValue({
    commits: [second],
    skip: 1,
    hasMore: false,
  });
  await actions.more();
  expect(git.history).toHaveBeenLastCalledWith('1', 1, PAGE);
  expect(useGit.getState().history.map((c) => c.oid)).toEqual([
    'abc1234def',
    'def',
  ]);
  expect(useGit.getState().hasMore).toBe(false);
});

test('pushing a branch with no upstream publishes it', async () => {
  await open();
  vi.mocked(git.status).mockResolvedValue({
    ...status,
    upstream: null,
    ahead: null,
    behind: null,
  });
  await actions.refresh();
  vi.mocked(git.push).mockResolvedValue(status);
  await actions.push();
  expect(git.push).toHaveBeenCalledWith('1', true);
});

test('pushing a tracked branch does not set an upstream again', async () => {
  await open();
  await actions.refresh();
  vi.mocked(git.push).mockResolvedValue(status);
  await actions.push();
  expect(git.push).toHaveBeenCalledWith('1', false);
});

test('a cancelled branch deletion leaves the branch list alone', async () => {
  await open();
  await actions.refresh();
  vi.mocked(git.branches).mockClear();
  vi.mocked(git.deleteBranch).mockResolvedValue(false);
  await actions.deleteBranch('feature/auth');
  expect(git.deleteBranch).toHaveBeenCalledWith('1', 'feature/auth');
  expect(git.branches).not.toHaveBeenCalled();
  expect(useGit.getState().branches).toEqual(branches);
});

test('a confirmed branch deletion rereads the branches', async () => {
  await open();
  await actions.refresh();
  vi.mocked(git.deleteBranch).mockResolvedValue(true);
  await actions.deleteBranch('feature/auth');
  expect(git.branches).toHaveBeenCalledTimes(2);
});

test('initializing a repository adopts it and loads its state', async () => {
  vi.mocked(git.detect).mockResolvedValue({ status: 'none' });
  vi.mocked(git.status).mockResolvedValue(status);
  vi.mocked(git.branches).mockResolvedValue(branches);
  vi.mocked(git.history).mockResolvedValue({
    commits: [],
    skip: 0,
    hasMore: false,
  });
  vi.mocked(git.diffSummary).mockResolvedValue([]);
  useWorkspace.setState({ workspace });
  await vi.waitFor(() => expect(useGit.getState().busy).toBe(false));
  vi.mocked(git.init).mockResolvedValue(repository);
  expect(await actions.init('main')).toBe(true);
  expect(git.init).toHaveBeenCalledWith('1', 'main');
  expect(useGit.getState().detection).toEqual({ status: 'found', repository });
  expect(useGit.getState().branches).toEqual(branches);
});

test('cloning reports where it landed and says nothing when cancelled', async () => {
  await open();
  vi.mocked(git.clone).mockResolvedValue({
    path: 'C:/code/copy',
    name: 'copy',
    defaultBranch: 'main',
  });
  await actions.clone('C:/code/app', 'copy');
  expect(git.clone).toHaveBeenCalledWith('1', 'C:/code/app', 'copy');
  expect(useGit.getState().notice).toContain('C:/code/copy');
  // Cloning never switches workspaces, so the open folder is still the one the user had.
  expect(useWorkspace.getState().workspace).toEqual(workspace);
  vi.mocked(git.clone).mockResolvedValue(null);
  await actions.clone('C:/code/app', 'copy');
  expect(useGit.getState().notice).toBeNull();
});

test('a preview that no longer differs is dropped rather than reported as a failure', async () => {
  await open();
  vi.mocked(git.diff).mockResolvedValue(fileDiff);
  await actions.select('src/app.ts', false);
  expect(git.diff).toHaveBeenCalledWith('1', 'src/app.ts', false);
  expect(useGit.getState().diff).toEqual(fileDiff);
  vi.mocked(git.diff).mockRejectedValue({
    code: 'GIT_FAILED',
    message: 'no such path',
  });
  vi.mocked(git.stage).mockResolvedValue(status);
  await actions.stage(['src/app.ts']);
  expect(useGit.getState().selected).toBeNull();
  expect(useGit.getState().error).toBeNull();
});
