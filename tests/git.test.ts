import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useGit } from '../src/stores/git';
import { useWorkspace } from '../src/stores/workspace';
import { git } from '../src/services/git';
import { fileSystem } from '../src/services/filesystem';
import { headLabel } from '../src/types/git';
import type { GitRepository } from '../src/types/git';
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
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useGit.setState(useGit.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
});

test('opening a workspace detects its repository', async () => {
  vi.mocked(git.detect).mockResolvedValue({ status: 'found', repository });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGit.getState().detection.status).toBe('found'),
  );
  expect(git.detect).toHaveBeenCalledWith('1');
  expect(useGit.getState().busy).toBe(false);
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
