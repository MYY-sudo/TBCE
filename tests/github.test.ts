import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useGitHub } from '../src/stores/github';
import { useWorkspace } from '../src/stores/workspace';
import { github } from '../src/services/github';
import { fileSystem } from '../src/services/filesystem';
import { accountLabel, rateLabel, scopeLabel } from '../src/types/github';
import type {
  GitHubAccount,
  GitHubBranch,
  GitHubCommit,
  GitHubPage,
  GitHubRepository,
} from '../src/types/github';
vi.mock('../src/services/github', () => ({
  github: {
    account: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    link: vi.fn(),
    repository: vi.fn(),
    branches: vi.fn(),
    commits: vi.fn(),
    activity: vi.fn(),
  },
}));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: { list: vi.fn(), chooseWorkspace: vi.fn() },
}));
vi.mock('../src/services/project', () => ({
  projects: { detect: vi.fn().mockResolvedValue({ status: 'none' }) },
}));
vi.mock('../src/services/git', () => ({
  git: { detect: vi.fn().mockResolvedValue({ status: 'none' }) },
}));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const signedIn: GitHubAccount = {
  status: 'signedIn',
  login: 'octocat',
  name: 'Öykü Çelik',
  scopes: ['repo'],
  rate: { limit: 5000, remaining: 4990, reset: 1789000000 },
};
const repository: GitHubRepository = {
  owner: 'MYY-sudo',
  name: 'TBCE',
  fullName: 'MYY-sudo/TBCE',
  description: 'Tools, Branches, Code, Everything',
  defaultBranch: 'main',
  private: false,
  fork: false,
  archived: false,
  stars: 3,
  forks: 0,
  watchers: 3,
  openIssuesAndPullRequests: 7,
  pushedAt: '2026-09-17T09:00:00Z',
  language: 'Rust',
  url: 'https://github.com/MYY-sudo/TBCE',
  rate: { limit: 5000, remaining: 4988, reset: 1789000000 },
};
const page = <T>(items: T[], hasMore = false): GitHubPage<T> => ({
  items,
  page: 1,
  hasMore,
  rate: null,
});
const branch: GitHubBranch = {
  name: 'main',
  oid: 'a'.repeat(40),
  protected: true,
};
const commit: GitHubCommit = {
  oid: 'b'.repeat(40),
  short: 'bbbbbbb',
  summary: 'feat: add the panel',
  author: 'Öykü Çelik',
  login: 'oyku',
  date: '2026-09-17T09:00:00Z',
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useGitHub.setState(useGitHub.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
});
/// A connected account with a linked repository, which is where the panel does its reading.
async function connect() {
  vi.mocked(github.account).mockResolvedValue(signedIn);
  vi.mocked(github.link).mockResolvedValue({
    status: 'found',
    remote: 'origin',
    owner: 'MYY-sudo',
    repo: 'TBCE',
  });
  vi.mocked(github.repository).mockResolvedValue(repository);
  vi.mocked(github.branches).mockResolvedValue(page([branch]));
  vi.mocked(github.commits).mockResolvedValue(page([commit]));
  vi.mocked(github.activity).mockResolvedValue(page([]));
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('found'),
  );
  await actions.loadAccount();
  await actions.refresh();
}

test('opening a folder reads its remote and asks GitHub nothing', async () => {
  vi.mocked(github.link).mockResolvedValue({ status: 'noRemote' });
  useWorkspace.setState({ workspace });

  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('noRemote'),
  );
  expect(github.link).toHaveBeenCalledWith('1');
  expect(github.account).not.toHaveBeenCalled();
  expect(github.repository).not.toHaveBeenCalled();
});

test('a folder whose remote is not GitHub keeps the host it found', async () => {
  vi.mocked(github.link).mockResolvedValue({
    status: 'notGitHub',
    remote: 'origin',
    host: 'gitlab.com',
  });
  useWorkspace.setState({ workspace });

  await vi.waitFor(() =>
    expect(useGitHub.getState().link).toEqual({
      status: 'notGitHub',
      remote: 'origin',
      host: 'gitlab.com',
    }),
  );
  expect(useGitHub.getState().error).toBeNull();
});

test('a refused link is reported without becoming an error state', async () => {
  vi.mocked(github.link).mockRejectedValue({
    code: 'STALE_WORKSPACE',
    message: 'The workspace changed.',
  });
  useWorkspace.setState({ workspace });

  await vi.waitFor(() =>
    expect(useGitHub.getState().error).toBe('The workspace changed.'),
  );
  expect(useGitHub.getState().link.status).toBe('noRepository');
});

test('refreshing while signed out reads the remote and nothing else', async () => {
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

  expect(await actions.refresh()).toBe(true);

  expect(github.repository).not.toHaveBeenCalled();
  expect(github.branches).not.toHaveBeenCalled();
  expect(github.commits).not.toHaveBeenCalled();
  expect(useGitHub.getState().repository).toBeNull();
});

test('one refresh reads everything the panel shows', async () => {
  await connect();

  const state = useGitHub.getState();
  expect(state.repository?.fullName).toBe('MYY-sudo/TBCE');
  expect(state.branches).toEqual([branch]);
  expect(state.commits).toEqual([commit]);
  expect(github.branches).toHaveBeenCalledWith('1', 1);
  expect(github.commits).toHaveBeenCalledWith('1', 1);
  expect(state.dataBusy).toBe(false);
});

test('switching tabs runs nothing at all', async () => {
  await connect();
  vi.mocked(github.repository).mockClear();
  vi.mocked(github.branches).mockClear();
  vi.mocked(github.commits).mockClear();

  actions.setTab('branches');
  actions.setTab('commits');

  expect(useGitHub.getState().tab).toBe('commits');
  expect(github.repository).not.toHaveBeenCalled();
  expect(github.branches).not.toHaveBeenCalled();
  expect(github.commits).not.toHaveBeenCalled();
});

test('refused activity leaves the rest of the refresh intact', async () => {
  vi.mocked(github.account).mockResolvedValue(signedIn);
  vi.mocked(github.link).mockResolvedValue({
    status: 'found',
    remote: 'origin',
    owner: 'MYY-sudo',
    repo: 'TBCE',
  });
  vi.mocked(github.repository).mockResolvedValue(repository);
  vi.mocked(github.branches).mockResolvedValue(page([branch]));
  vi.mocked(github.commits).mockResolvedValue(page([commit]));
  vi.mocked(github.activity).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'no access',
  });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('found'),
  );
  await actions.loadAccount();

  expect(await actions.refresh()).toBe(true);

  const state = useGitHub.getState();
  expect(state.activityDenied).toBe(true);
  expect(state.activity).toEqual([]);
  expect(state.repository?.fullName).toBe('MYY-sudo/TBCE');
  expect(state.error).toBeNull();
});

test('a further page is appended rather than replacing what is shown', async () => {
  await connect();
  const second: GitHubCommit = {
    ...commit,
    oid: 'c'.repeat(40),
    short: 'ccccccc',
  };
  vi.mocked(github.commits).mockResolvedValue({
    items: [second],
    page: 2,
    hasMore: false,
    rate: { limit: 5000, remaining: 4000, reset: 1789000001 },
  });

  expect(await actions.moreCommits()).toBe(true);

  const state = useGitHub.getState();
  expect(state.commits.map((c) => c.short)).toEqual(['bbbbbbb', 'ccccccc']);
  expect(state.commitPage).toBe(2);
  expect(state.commitsMore).toBe(false);
  expect(github.commits).toHaveBeenLastCalledWith('1', 2);
  expect(state.rate?.remaining).toBe(4000);
});

test('branch paging follows the same rule', async () => {
  vi.mocked(github.account).mockResolvedValue(signedIn);
  vi.mocked(github.link).mockResolvedValue({
    status: 'found',
    remote: 'origin',
    owner: 'MYY-sudo',
    repo: 'TBCE',
  });
  vi.mocked(github.repository).mockResolvedValue(repository);
  vi.mocked(github.branches).mockResolvedValue(page([branch], true));
  vi.mocked(github.commits).mockResolvedValue(page([commit]));
  vi.mocked(github.activity).mockResolvedValue(page([]));
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('found'),
  );
  await actions.loadAccount();
  await actions.refresh();
  expect(useGitHub.getState().branchesMore).toBe(true);
  vi.mocked(github.branches).mockResolvedValue({
    items: [{ name: 'fix/navbar', oid: 'd'.repeat(40), protected: false }],
    page: 2,
    hasMore: false,
    rate: null,
  });

  expect(await actions.moreBranches()).toBe(true);

  expect(useGitHub.getState().branches.map((b) => b.name)).toEqual([
    'main',
    'fix/navbar',
  ]);
  expect(github.branches).toHaveBeenLastCalledWith('1', 2);
});

test('an answer for a replaced folder is discarded', async () => {
  await connect();
  let release!: (value: GitHubRepository) => void;
  vi.mocked(github.repository).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const pending = actions.refresh();
  // The remote is read before the repository, so wait until the deferred call is the one in flight.
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  useWorkspace.setState({ workspace: { ...workspace, id: '2' } });
  release({ ...repository, fullName: 'someone/else' });

  expect(await pending).toBe(false);
  expect(useGitHub.getState().repository).toBeNull();
});

test('a second read started while one runs is refused', async () => {
  await connect();
  let release!: (value: GitHubRepository) => void;
  vi.mocked(github.repository).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const first = actions.refresh();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));

  expect(await actions.moreCommits()).toBe(false);

  release(repository);
  expect(await first).toBe(true);
});

test('signing in stores nothing locally and reports the account', async () => {
  vi.mocked(github.signIn).mockResolvedValue(signedIn);

  expect(await actions.signIn('ghp_token')).toBe(true);

  expect(github.signIn).toHaveBeenCalledWith('ghp_token');
  expect(useGitHub.getState().account).toEqual(signedIn);
  expect(useGitHub.getState().notice).toBe('GitHub account connected.');
  expect(JSON.stringify(localStorage)).not.toContain('ghp_token');
});

test('a rejected token leaves the account signed out and explains why', async () => {
  vi.mocked(github.signIn).mockRejectedValue({
    code: 'GITHUB_AUTH_FAILED',
    message: 'GitHub rejected the stored token.',
  });

  expect(await actions.signIn('ghp_typo')).toBe(false);

  expect(useGitHub.getState().account.status).toBe('signedOut');
  expect(useGitHub.getState().error).toBe('GitHub rejected the stored token.');
});

test('signing out forgets the repository as well as the account', async () => {
  await connect();
  vi.mocked(github.signOut).mockResolvedValue(undefined);

  expect(await actions.signOut()).toBe(true);

  const state = useGitHub.getState();
  expect(state.account.status).toBe('signedOut');
  expect(state.repository).toBeNull();
  expect(state.commits).toEqual([]);
  expect(state.branches).toEqual([]);
  expect(state.notice).toBe('GitHub account disconnected.');
});

test('opening another folder keeps the account and forgets the repository', async () => {
  await connect();
  vi.mocked(github.link).mockResolvedValue({ status: 'noRepository' });

  useWorkspace.setState({
    workspace: { id: '2', name: 'other', path: 'C:/o' },
  });
  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('noRepository'),
  );

  const state = useGitHub.getState();
  expect(state.account).toEqual(signedIn);
  expect(state.repository).toBeNull();
  expect(state.commits).toEqual([]);
});

test('loading commits does not block signing out', async () => {
  await connect();
  let release!: (value: GitHubPage<GitHubCommit>) => void;
  vi.mocked(github.commits).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  vi.mocked(github.signOut).mockResolvedValue(undefined);
  const paging = actions.moreCommits();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));

  expect(await actions.signOut()).toBe(true);

  release(page([commit]));
  expect(await paging).toBe(false);
  expect(useGitHub.getState().account.status).toBe('signedOut');
  expect(useGitHub.getState().commits).toEqual([]);
  expect(useGitHub.getState().dataBusy).toBe(false);
});

test.each(['loadAccount', 'signIn', 'signOut'] as const)(
  '%s retains the account lock across workspace changes',
  async (operation) => {
    await connect();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(github.account).mockImplementationOnce(async () => {
      await gate;
      return signedIn;
    });
    vi.mocked(github.signIn).mockImplementationOnce(async () => {
      await gate;
      return signedIn;
    });
    vi.mocked(github.signOut).mockImplementationOnce(() => gate);
    const pending = actions[operation]('ghp_test');
    useWorkspace.setState({ workspace: { ...workspace, id: 'second' } });
    expect(useGitHub.getState().accountBusy).toBe(true);
    expect(await actions.loadAccount()).toBe(false);
    expect(await actions.signIn('ghp_other')).toBe(false);
    expect(await actions.signOut()).toBe(false);
    expect(await actions.refresh()).toBe(false);
    release();
    expect(await pending).toBe(true);
    expect(useGitHub.getState().accountBusy).toBe(false);
  },
);

test.each(['repository', 'branches', 'commits', 'activity'] as const)(
  'authentication failure from %s clears all repository data',
  async (operation) => {
    await connect();
    vi.mocked(github[operation]).mockRejectedValueOnce({
      code: 'GITHUB_AUTH_FAILED',
      message: 'Connect the account again.',
    });
    expect(await actions.refresh()).toBe(false);
    expect(useGitHub.getState()).toMatchObject({
      account: { status: 'signedOut' },
      repository: null,
      branches: [],
      commits: [],
      activity: [],
      rate: null,
      dataBusy: false,
      error: 'Connect the account again.',
    });
  },
);

test.each([
  'GITHUB_NETWORK_FAILED',
  'GITHUB_RATE_LIMITED',
  'GITHUB_TIMED_OUT',
  'GITHUB_UNAVAILABLE',
  'GITHUB_NOT_FOUND',
])('activity %s preserves metadata and its actual error', async (code) => {
  await connect();
  vi.mocked(github.activity).mockRejectedValueOnce({
    code,
    message: `Failure: ${code}`,
  });
  expect(await actions.refresh()).toBe(true);
  expect(useGitHub.getState()).toMatchObject({
    repository,
    activityDenied: false,
    activityError: `Failure: ${code}`,
  });
  await actions.refresh();
  expect(useGitHub.getState().activityError).toBeNull();
});

test('an empty commits page retains the overview without an error', async () => {
  await connect();
  vi.mocked(github.branches).mockResolvedValue(page([]));
  vi.mocked(github.commits).mockResolvedValue(page([]));
  await actions.refresh();
  expect(useGitHub.getState()).toMatchObject({
    repository,
    commits: [],
    commitsMore: false,
    error: null,
  });
});

test('a commits conflict preserves the overview and reports the failure', async () => {
  await connect();
  vi.mocked(github.commits).mockRejectedValue({
    code: 'GITHUB_UNAVAILABLE',
    message: 'GitHub answered with status 409. Conflict.',
  });
  await actions.refresh();
  expect(useGitHub.getState()).toMatchObject({
    repository,
    commits: [],
    error: 'GitHub answered with status 409. Conflict.',
  });
});

test('a delayed failure cannot overwrite a disconnect notice', async () => {
  await connect();
  let reject!: (error: unknown) => void;
  vi.mocked(github.commits).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const pending = actions.moreCommits();
  await actions.signOut();
  reject({ code: 'GITHUB_AUTH_FAILED', message: 'Old failure' });
  expect(await pending).toBe(false);
  expect(useGitHub.getState()).toMatchObject({
    error: null,
    notice: 'GitHub account disconnected.',
    commits: [],
  });
});

test('reauthentication discards old reads and stops the remaining refresh calls', async () => {
  await connect();
  let release!: (value: GitHubRepository) => void;
  vi.mocked(github.repository).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = actions.refresh();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  vi.mocked(github.signIn).mockResolvedValue({
    ...signedIn,
    login: 'another-user',
  });
  await actions.signIn('ghp_new');
  vi.mocked(github.branches).mockClear();
  release(repository);
  expect(await pending).toBe(false);
  expect(github.branches).not.toHaveBeenCalled();
  expect(useGitHub.getState()).toMatchObject({
    account: { login: 'another-user' },
    repository: null,
    commits: [],
  });
});

test('account validation that reports signed out clears previously loaded data', async () => {
  await connect();
  vi.mocked(github.account).mockResolvedValue({ status: 'signedOut' });
  await actions.loadAccount();
  expect(useGitHub.getState()).toMatchObject({
    account: { status: 'signedOut' },
    repository: null,
    commits: [],
  });
});

test('no read happens without an open folder', async () => {
  expect(await actions.refresh()).toBe(false);
  expect(await actions.moreCommits()).toBe(false);
  expect(github.link).not.toHaveBeenCalled();
  expect(github.commits).not.toHaveBeenCalled();
});

test('labels explain what GitHub reported', () => {
  expect(accountLabel(signedIn)).toBe('Öykü Çelik (octocat)');
  expect(accountLabel({ ...signedIn, name: null })).toBe('octocat');
  expect(accountLabel({ status: 'signedOut' })).toBe('Not connected');
  expect(scopeLabel([])).toBe('not reported for this token');
  expect(scopeLabel(['repo', 'read:org'])).toBe('repo, read:org');
  expect(rateLabel(null)).toBe('Rate limit not reported');
  expect(
    rateLabel({ limit: 5000, remaining: 4990, reset: 1789000000 }),
  ).toContain('4990 of 5000 requests left');
});
