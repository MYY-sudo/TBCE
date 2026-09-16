import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { SourceControlPanel } from '../src/git/SourceControlPanel';
import { git } from '../src/services/git';
import { fileSystem } from '../src/services/filesystem';
import { useGit } from '../src/stores/git';
import { useWorkspace } from '../src/stores/workspace';
import { ask } from '../src/stores/dialog';
import type {
  GitBranches,
  GitCommit,
  GitDetection,
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
  ahead: 2,
  behind: 1,
  staged: [
    { path: 'src/staged.ts', originalPath: null, state: 'modified' as const },
  ],
  unstaged: [
    { path: 'src/app.ts', originalPath: null, state: 'modified' as const },
  ],
  untracked: ['src/new.ts'],
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
      ahead: 2,
      behind: 1,
      gone: false,
      current: true,
      worktree: null,
      remote: false,
    },
    {
      name: 'feature/auth',
      oid: 'def5678abc',
      upstream: null,
      ahead: null,
      behind: null,
      gone: false,
      current: false,
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
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useGit.setState(useGit.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  vi.mocked(git.status).mockResolvedValue(status);
  vi.mocked(git.branches).mockResolvedValue(branches);
  vi.mocked(git.history).mockResolvedValue({
    commits: [commit],
    skip: 0,
    hasMore: false,
  });
  vi.mocked(git.diffSummary).mockResolvedValue([]);
});
/// Opens a workspace with the given detection and renders the panel it produces.
async function open(
  detection: GitDetection = { status: 'found', repository },
  override: Partial<GitStatus> = {},
) {
  vi.mocked(git.detect).mockResolvedValue(detection);
  vi.mocked(git.status).mockResolvedValue({ ...status, ...override });
  useWorkspace.setState({ workspace });
  render(<SourceControlPanel />);
  await waitFor(() =>
    expect(useGit.getState().detection.status).toBe(detection.status),
  );
}

test('a folder with no repository offers to initialize or clone one', async () => {
  await open({ status: 'none' });
  expect(await screen.findByText(/not a Git repository/i)).toBeInTheDocument();
  vi.mocked(ask).mockResolvedValue('trunk');
  vi.mocked(git.init).mockResolvedValue(repository);
  fireEvent.click(
    screen.getByRole('button', { name: 'Initialize repository' }),
  );
  await waitFor(() => expect(git.init).toHaveBeenCalledWith('1', 'trunk'));
});

test('a cancelled initialization creates nothing', async () => {
  await open({ status: 'none' });
  vi.mocked(ask).mockResolvedValue(null);
  fireEvent.click(
    screen.getByRole('button', { name: 'Initialize repository' }),
  );
  await waitFor(() => expect(ask).toHaveBeenCalled());
  expect(git.init).not.toHaveBeenCalled();
});

test('a repository above the workspace explains itself and offers no operations', async () => {
  await open({ status: 'parent', root: 'C:/code' });
  expect(await screen.findByText(/above this folder/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Fetch' })).toBeNull();
  expect(git.status).not.toHaveBeenCalled();
});

test('a missing Git installation is explained without blocking the editor', async () => {
  await open({
    status: 'unavailable',
    code: 'GIT_MISSING',
    message: 'Git was not found.',
  });
  expect(await screen.findByText(/Git was not found/)).toBeInTheDocument();
  expect(screen.getByText(/Editing this folder is unaffected/)).toBeVisible();
});

test('the panel lists staged, changed and untracked files with the branch state', async () => {
  await open();
  expect(await screen.findByText('staged.ts')).toBeInTheDocument();
  expect(screen.getByText('app.ts')).toBeInTheDocument();
  expect(screen.getByText('new.ts')).toBeInTheDocument();
  expect(screen.getByText('origin/main')).toBeInTheDocument();
  // The branch names the header and the branch list, so it appears twice.
  expect(screen.getAllByText('main')).toHaveLength(2);
});

test('staging and unstaging a path go through the service', async () => {
  await open();
  vi.mocked(git.stage).mockResolvedValue(status);
  vi.mocked(git.unstage).mockResolvedValue(status);
  fireEvent.click(await screen.findByLabelText('Stage src/app.ts'));
  await waitFor(() =>
    expect(git.stage).toHaveBeenCalledWith('1', ['src/app.ts']),
  );
  fireEvent.click(screen.getByLabelText('Unstage src/staged.ts'));
  await waitFor(() =>
    expect(git.unstage).toHaveBeenCalledWith('1', ['src/staged.ts']),
  );
});

test('selecting a change opens its diff', async () => {
  await open();
  vi.mocked(git.diff).mockResolvedValue({
    path: 'src/app.ts',
    originalPath: null,
    staged: false,
    binary: false,
    truncated: false,
    added: 1,
    removed: 0,
    patch: '@@ -0,0 +1 @@\n+a\n',
  });
  fireEvent.click(await screen.findByText('app.ts'));
  await waitFor(() =>
    expect(git.diff).toHaveBeenCalledWith('1', 'src/app.ts', false),
  );
});

test('committing requires a message, and sends the one that was typed', async () => {
  await open();
  const button = await screen.findByRole('button', { name: /^Commit$/ });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Commit message'), {
    target: { value: 'feat: add the panel' },
  });
  expect(button).toBeEnabled();
  vi.mocked(git.commit).mockResolvedValue(commit);
  fireEvent.click(button);
  await waitFor(() =>
    expect(git.commit).toHaveBeenCalledWith('1', 'feat: add the panel'),
  );
});

test('committing is refused while nothing is staged', async () => {
  await open({ status: 'found', repository }, { staged: [] });
  await screen.findByText('app.ts');
  fireEvent.change(screen.getByLabelText('Commit message'), {
    target: { value: 'feat: add the panel' },
  });
  expect(screen.getByRole('button', { name: /^Commit$/ })).toBeDisabled();
});

test('a conflicted file is listed and blocks committing', async () => {
  await open(
    { status: 'found', repository },
    { conflicts: [{ path: 'src/app.ts', state: 'both modified' }] },
  );
  expect(await screen.findByText(/both modified/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Commit message'), {
    target: { value: 'fix: resolve' },
  });
  expect(screen.getByRole('button', { name: /^Commit$/ })).toBeDisabled();
});

test('a branch with no upstream cannot be pulled but can be published', async () => {
  await open(
    { status: 'found', repository },
    { upstream: null, ahead: null, behind: null },
  );
  await screen.findByText('No upstream');
  expect(screen.getByRole('button', { name: 'Pull' })).toBeDisabled();
  vi.mocked(git.push).mockResolvedValue(status);
  fireEvent.click(screen.getByRole('button', { name: 'Push' }));
  await waitFor(() => expect(git.push).toHaveBeenCalledWith('1', true));
});

test('another branch can be checked out and the current one cannot be deleted', async () => {
  await open();
  vi.mocked(git.checkoutBranch).mockResolvedValue(status);
  fireEvent.click(await screen.findByText('feature/auth'));
  await waitFor(() =>
    expect(git.checkoutBranch).toHaveBeenCalledWith('1', 'feature/auth'),
  );
  // Git refuses to delete the checked-out branch, so the panel does not offer it either.
  expect(screen.getByLabelText('Delete main')).toBeDisabled();
});

test('deleting a branch asks the backend, which confirms natively', async () => {
  await open();
  vi.mocked(git.deleteBranch).mockResolvedValue(false);
  fireEvent.click(await screen.findByLabelText('Delete feature/auth'));
  await waitFor(() =>
    expect(git.deleteBranch).toHaveBeenCalledWith('1', 'feature/auth'),
  );
  // A cancelled confirmation leaves the branch where it was.
  expect(screen.getByText('feature/auth')).toBeInTheDocument();
});

test('creating a branch asks for a name and does not switch to it', async () => {
  await open();
  vi.mocked(ask).mockResolvedValue('feature/panel');
  vi.mocked(git.createBranch).mockResolvedValue(branches);
  fireEvent.click(await screen.findByLabelText('New branch'));
  await waitFor(() =>
    expect(git.createBranch).toHaveBeenCalledWith('1', 'feature/panel'),
  );
  expect(git.checkoutBranch).not.toHaveBeenCalled();
});

test('history is paged rather than loaded whole', async () => {
  vi.mocked(git.history).mockResolvedValue({
    commits: [commit],
    skip: 0,
    hasMore: true,
  });
  await open();
  expect(await screen.findByText('feat: add the panel')).toBeInTheDocument();
  expect(screen.getByText('abc1234')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  await waitFor(() => expect(git.history).toHaveBeenCalledTimes(2));
});

test('an unborn branch reports an empty history rather than an error', async () => {
  vi.mocked(git.history).mockResolvedValue({
    commits: [],
    skip: 0,
    hasMore: false,
  });
  await open({
    status: 'found',
    repository: { ...repository, head: { kind: 'unborn', branch: 'main' } },
  });
  expect(await screen.findByText('No commits yet.')).toBeInTheDocument();
  expect(screen.getByText('main (no commits yet)')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a failed operation is reported without clearing what is on screen', async () => {
  await open();
  await screen.findByText('app.ts');
  vi.mocked(git.pull).mockRejectedValue({
    code: 'GIT_DIVERGED',
    message: 'The branch has diverged from its upstream.',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The branch has diverged from its upstream.',
  );
  expect(screen.getByText('app.ts')).toBeInTheDocument();
});

test('the panel says so when no folder is open', () => {
  render(<SourceControlPanel />);
  expect(screen.getByText('No folder open')).toBeInTheDocument();
  expect(git.status).not.toHaveBeenCalled();
});

test('saving a file refreshes the panel, because the disk is what Git reads', async () => {
  await open();
  await screen.findByText('app.ts');
  await waitFor(() => expect(git.status).toHaveBeenCalledTimes(1));
  // Saving rewrites the revision. Git reports saved bytes, never editor buffers.
  useWorkspace.setState({
    tabs: [
      {
        id: 'tab-1',
        path: 'src/app.ts',
        content: 'b',
        savedContent: 'b',
        revision: 'sha-2',
        bom: false,
        external: null,
      },
    ],
  });
  await waitFor(() => expect(git.status).toHaveBeenCalledTimes(2));
});
