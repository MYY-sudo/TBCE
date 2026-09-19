import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useDashboard } from '../src/stores/dashboard';
import { useGitHub } from '../src/stores/github';
import { useGit } from '../src/stores/git';
import { useWorkspace } from '../src/stores/workspace';
import { github } from '../src/services/github';
import { git } from '../src/services/git';
import { fileSystem } from '../src/services/filesystem';
import { milestoneProgress } from '../src/types/github';
import type {
  GitHubAccount,
  GitHubCounts,
  GitHubHeadChecks,
  GitHubMilestone,
} from '../src/types/github';
vi.mock('../src/services/github', () => ({
  github: {
    account: vi.fn(),
    link: vi.fn(),
    repository: vi.fn(),
    branches: vi.fn(),
    commits: vi.fn(),
    activity: vi.fn(),
    issues: vi.fn(),
    pullRequests: vi.fn(),
    counts: vi.fn(),
    milestones: vi.fn(),
    headChecks: vi.fn(),
  },
}));
vi.mock('../src/services/git', () => ({
  git: {
    detect: vi.fn(),
    status: vi.fn(),
    branches: vi.fn(),
    history: vi.fn(),
    diffSummary: vi.fn(),
  },
}));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: { list: vi.fn(), chooseWorkspace: vi.fn() },
}));
vi.mock('../src/services/project', () => ({
  projects: { detect: vi.fn().mockResolvedValue({ status: 'none' }) },
}));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const signedIn: GitHubAccount = {
  status: 'signedIn',
  login: 'octocat',
  name: null,
  scopes: [],
  rate: null,
};
const counts: GitHubCounts = {
  openPullRequests: 3,
  openIssues: 12,
  issuesDisabled: false,
  rate: null,
};
const milestone: GitHubMilestone = {
  number: 2,
  title: 'V1',
  dueOn: '2026-10-01T07:00:00Z',
  openIssues: 3,
  closedIssues: 9,
};
const head: GitHubHeadChecks = {
  oid: '0123456789abcdef0123456789abcdef01234567',
  checks: {
    summary: 'passing',
    entries: [],
    truncated: false,
    runsDenied: false,
    statusesDenied: false,
    missing: false,
    error: null,
  },
  rate: null,
};
const empty = { items: [], page: 1, hasMore: false, rate: null };
const tab = {
  id: 'tab-1',
  path: 'src/app.ts',
  content: 'a',
  savedContent: 'a',
  revision: 'sha-1',
  bom: false,
  external: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  useDashboard.setState(useDashboard.getInitialState(), true);
  useGitHub.setState(useGitHub.getInitialState(), true);
  useGit.setState(useGit.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  vi.mocked(git.detect).mockResolvedValue({ status: 'none' });
  vi.mocked(github.link).mockResolvedValue({ status: 'noRepository' });
  vi.mocked(github.counts).mockResolvedValue(counts);
  vi.mocked(github.milestones).mockResolvedValue({
    ...empty,
    items: [milestone],
    hasMore: true,
  });
  vi.mocked(github.headChecks).mockResolvedValue(head);
});
/// A folder whose remote is on GitHub, with an account connected.
async function connect() {
  vi.mocked(github.link).mockResolvedValue({
    status: 'found',
    remote: 'origin',
    owner: 'MYY-sudo',
    repo: 'TBCE',
  });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('found'),
  );
  useGitHub.setState({ account: signedIn });
}

test('signed out, the dashboard asks GitHub nothing', async () => {
  useWorkspace.setState({ workspace });

  expect(await actions.refresh()).toBe(true);

  expect(github.counts).not.toHaveBeenCalled();
  expect(github.milestones).not.toHaveBeenCalled();
  expect(github.headChecks).not.toHaveBeenCalled();
  expect(useDashboard.getState().counts).toBeNull();
});

test('one refresh reads counts, milestones and the checks of HEAD', async () => {
  await connect();

  expect(await actions.refresh()).toBe(true);

  const state = useDashboard.getState();
  expect(github.counts).toHaveBeenCalledWith('1');
  expect(github.headChecks).toHaveBeenCalledWith('1');
  expect(state.counts).toEqual(counts);
  expect(state.milestones).toEqual([milestone]);
  expect(state.milestonesMore).toBe(true);
  expect(state.head).toEqual(head);
  expect(state.busy).toBe(false);
});

test('a refusal or failure stays in its own section', async () => {
  await connect();
  vi.mocked(github.counts).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'Resource not accessible by personal access token',
  });
  vi.mocked(github.milestones).mockRejectedValue({
    code: 'GITHUB_UNAVAILABLE',
    message: 'GitHub is not answering correctly right now.',
  });

  expect(await actions.refresh()).toBe(true);

  const state = useDashboard.getState();
  expect(state.countsDenied).toBe(true);
  expect(state.countsError).toBeNull();
  expect(state.milestonesDenied).toBe(false);
  expect(state.milestonesError).toBe(
    'GitHub is not answering correctly right now.',
  );
  // The checks of HEAD were still read after both.
  expect(state.head).toEqual(head);
});

test('a rejected token stops the reads and reloads the account', async () => {
  await connect();
  vi.mocked(github.counts).mockRejectedValue({
    code: 'GITHUB_AUTH_FAILED',
    message: 'GitHub rejected the stored token.',
  });
  vi.mocked(github.account).mockResolvedValue({ status: 'signedOut' });

  expect(await actions.refresh()).toBe(false);

  expect(github.milestones).not.toHaveBeenCalled();
  expect(github.headChecks).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(useGitHub.getState().account.status).toBe('signedOut'),
  );
  expect(useDashboard.getState().counts).toBeNull();
});

test('an answer for a replaced folder is discarded', async () => {
  await connect();
  let answer: (value: GitHubCounts) => void = () => {};
  vi.mocked(github.counts).mockReturnValue(
    new Promise((resolve) => (answer = resolve)),
  );

  const pending = actions.refresh();
  useWorkspace.setState({
    workspace: { id: '2', name: 'other', path: 'C:/code/other' },
  });
  answer(counts);

  expect(await pending).toBe(false);
  expect(useDashboard.getState().counts).toBeNull();
  expect(github.headChecks).not.toHaveBeenCalled();
});

test('signing out clears what was read with the account', async () => {
  await connect();
  await actions.refresh();

  useGitHub.setState({ account: { status: 'signedOut' } });

  expect(useDashboard.getState().counts).toBeNull();
  expect(useDashboard.getState().head).toBeNull();
});

test('refreshing everything reads local Git and the GitHub store too', async () => {
  vi.mocked(git.detect).mockResolvedValue({
    status: 'found',
    repository: {
      root: 'C:/code/app',
      gitDir: 'C:/code/app/.git',
      commonDir: 'C:/code/app/.git',
      linkedWorktree: false,
      bare: false,
      head: { kind: 'branch', name: 'main', oid: 'abc' },
    },
  });
  vi.mocked(git.status).mockResolvedValue({
    repository: {
      root: 'C:/code/app',
      gitDir: 'C:/code/app/.git',
      commonDir: 'C:/code/app/.git',
      linkedWorktree: false,
      bare: false,
      head: { kind: 'branch', name: 'main', oid: 'abc' },
    },
    branch: 'main',
    upstream: null,
    ahead: null,
    behind: null,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  });
  vi.mocked(git.branches).mockResolvedValue({
    current: 'main',
    detached: false,
    defaultBranch: 'main',
    local: [],
    remote: [],
  });
  vi.mocked(git.history).mockResolvedValue({
    commits: [],
    skip: 0,
    hasMore: false,
  });
  vi.mocked(git.diffSummary).mockResolvedValue([]);
  await connect();
  await vi.waitFor(() =>
    expect(useGit.getState().detection.status).toBe('found'),
  );
  await vi.waitFor(() => expect(useGit.getState().busy).toBe(false));
  vi.mocked(github.repository).mockRejectedValue({
    code: 'GITHUB_TIMED_OUT',
    message: 'GitHub did not answer in time.',
  });

  await actions.refreshAll();

  expect(git.status).toHaveBeenCalledWith('1');
  expect(github.repository).toHaveBeenCalledWith('1');
  expect(github.counts).toHaveBeenCalledWith('1');
});

test('the dashboard is shown in front of a diff or patch, and a file comes back in front of it', async () => {
  useWorkspace.setState({ workspace, tabs: [tab], activeId: null });
  useGit.setState({
    selected: { path: 'src/app.ts', staged: false },
    diff: null,
  });

  actions.show();

  expect(useDashboard.getState().open).toBe(true);
  expect(useGit.getState().selected).toBeNull();
  useWorkspace.setState({ activeId: 'tab-1' });
  expect(useDashboard.getState().open).toBe(false);
});

test('opening a diff or a pull request patch puts it in front of the dashboard', () => {
  useWorkspace.setState({ workspace });
  actions.show();
  useGit.setState({ selected: { path: 'src/app.ts', staged: false } });
  expect(useDashboard.getState().open).toBe(false);

  useGit.setState({ selected: null });
  actions.show();
  useGitHub.setState({
    pullFile: {
      number: 4,
      file: {
        path: 'a.ts',
        previousPath: null,
        status: 'added',
        additions: 1,
        deletions: 0,
        patch: null,
      },
    },
  });
  expect(useDashboard.getState().open).toBe(false);
});

test('milestone progress is the closed share, and nothing assigned is not zero percent', () => {
  expect(milestoneProgress(milestone)).toBe(0.75);
  expect(
    milestoneProgress({ ...milestone, openIssues: 0, closedIssues: 0 }),
  ).toBeNull();
});
