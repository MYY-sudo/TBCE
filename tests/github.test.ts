import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useGitHub } from '../src/stores/github';
import { useWorkspace } from '../src/stores/workspace';
import { useGit } from '../src/stores/git';
import { github } from '../src/services/github';
import { fileSystem } from '../src/services/filesystem';
import {
  accountLabel,
  checksLabel,
  droppedLabel,
  mergeableLabel,
  pullStateLabel,
  sourceLabel,
  issueStateLabel,
  matchesFilter,
  rateLabel,
  scopeLabel,
} from '../src/types/github';
import type {
  GitHubAccount,
  GitHubBranch,
  GitHubCommit,
  GitHubIssue,
  GitHubIssueChoices,
  GitHubIssueDetail,
  GitHubPage,
  GitHubPullFile,
  GitHubPullRequest,
  GitHubPullRequestDetail,
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
    issues: vi.fn(),
    issue: vi.fn(),
    issueChoices: vi.fn(),
    createIssue: vi.fn(),
    closeIssue: vi.fn(),
    reopenIssue: vi.fn(),
    pullRequests: vi.fn(),
    pullRequest: vi.fn(),
    pullFiles: vi.fn(),
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
  hasIssues: true,
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
const issue: GitHubIssue = {
  number: 7,
  title: 'Kaydetme çöküyor',
  state: 'open',
  stateReason: null,
  author: 'oyku',
  labels: [{ name: 'bug', color: 'd73a4a' }],
  assignees: ['octocat'],
  milestone: { number: 2, title: 'V1' },
  comments: 3,
  createdAt: '2026-09-18T10:00:00Z',
  updatedAt: null,
  closedAt: null,
};
const other: GitHubIssue = {
  ...issue,
  number: 6,
  title: 'Docs',
  labels: [],
  assignees: [],
  milestone: null,
};
const detail = (
  changes: Partial<GitHubIssueDetail> = {},
): GitHubIssueDetail => ({
  ...issue,
  body: 'Adımlar:\n1. aç',
  rate: null,
  ...changes,
});
const choices: GitHubIssueChoices = {
  labels: [{ name: 'bug', color: 'd73a4a', description: null }],
  assignees: ['octocat', 'oyku'],
  milestones: [{ number: 2, title: 'V1', dueOn: null }],
  truncated: false,
  rate: null,
};
const pull: GitHubPullRequest = {
  number: 12,
  title: 'Oturum açma akışı',
  state: 'open',
  draft: false,
  merged: false,
  author: 'oyku',
  head: {
    reference: 'feature/auth',
    label: 'MYY-sudo:feature/auth',
    sha: 'c'.repeat(40),
    repository: 'MYY-sudo/TBCE',
  },
  base: { reference: 'main' },
  crossRepository: false,
  labels: [],
  assignees: [],
  reviewers: ['octocat'],
  milestone: null,
  createdAt: '2026-09-18T10:00:00Z',
  updatedAt: null,
  closedAt: null,
  mergedAt: null,
};
const pullDetail = (
  changes: Partial<GitHubPullRequestDetail> = {},
): GitHubPullRequestDetail => ({
  ...pull,
  body: 'Özet',
  commits: 2,
  additions: 10,
  deletions: 1,
  changedFiles: 2,
  comments: 0,
  reviewComments: 0,
  mergeable: true,
  mergeableState: 'clean',
  checks: {
    summary: 'passing',
    entries: [
      {
        name: 'build',
        source: 'run',
        outcome: 'passing',
        state: 'success',
        description: 'GitHub Actions',
      },
    ],
    truncated: false,
    runsDenied: false,
    statusesDenied: false,
    missing: false,
    error: null,
  },
  rate: null,
  ...changes,
});
const file = (
  path: string,
  patch: string | null = '@@ -1 +1 @@',
): GitHubPullFile => ({
  path,
  previousPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  patch,
});
const openFilter = {
  state: 'open',
  label: null,
  assignee: null,
  milestone: null,
} as const;
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
  vi.mocked(github.issues).mockResolvedValue(page([issue, other], true));
  vi.mocked(github.pullRequests).mockResolvedValue(page([pull], true));
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

test('one refresh also reads the first page of open issues', async () => {
  await connect();

  const state = useGitHub.getState();
  expect(github.issues).toHaveBeenCalledWith('1', openFilter, 1);
  expect(state.issues.map((entry) => entry.number)).toEqual([7, 6]);
  expect(state.issuesMore).toBe(true);
  expect(state.issuesDenied).toBe(false);
  expect(state.issuesError).toBeNull();
});

test('switching to the issues tab reads nothing', async () => {
  await connect();
  vi.mocked(github.issues).mockClear();

  actions.setTab('issues');

  expect(useGitHub.getState().tab).toBe('issues');
  expect(github.issues).not.toHaveBeenCalled();
  expect(github.issueChoices).not.toHaveBeenCalled();
});

test('a repository with issues turned off is never asked for them', async () => {
  await connect();
  vi.mocked(github.repository).mockResolvedValue({
    ...repository,
    hasIssues: false,
  });
  vi.mocked(github.issues).mockClear();

  expect(await actions.refresh()).toBe(true);

  expect(github.issues).not.toHaveBeenCalled();
  expect(useGitHub.getState()).toMatchObject({
    issuesDisabled: true,
    issues: [],
    error: null,
  });
});

test.each([
  ['GITHUB_FORBIDDEN', { issuesDenied: true, issuesError: null }],
  ['GITHUB_ISSUES_DISABLED', { issuesDisabled: true, issuesError: null }],
  [
    'GITHUB_UNAVAILABLE',
    { issuesDenied: false, issuesError: 'Failure: GITHUB_UNAVAILABLE' },
  ],
])(
  'refused issues (%s) leave the rest of the refresh intact',
  async (code, expected) => {
    await connect();
    vi.mocked(github.issues).mockRejectedValueOnce({
      code,
      message: `Failure: ${code}`,
    });

    expect(await actions.refresh()).toBe(true);

    expect(useGitHub.getState()).toMatchObject({
      ...expected,
      issues: [],
      repository,
      commits: [commit],
      error: null,
    });
  },
);

test('a new filter reads its first page and is kept once GitHub answers', async () => {
  await connect();
  vi.mocked(github.issues).mockResolvedValue(page([issue]));

  expect(await actions.setIssueFilter({ label: 'bug', state: 'closed' })).toBe(
    true,
  );

  const filter = { ...openFilter, state: 'closed', label: 'bug' };
  expect(github.issues).toHaveBeenLastCalledWith('1', filter, 1);
  expect(useGitHub.getState()).toMatchObject({
    issueFilter: filter,
    issues: [issue],
    issuePage: 1,
    issuesMore: false,
  });
});

test('a filter GitHub refuses leaves the previous filter and list in place', async () => {
  await connect();
  vi.mocked(github.issues).mockRejectedValueOnce({
    code: 'GITHUB_INVALID_ISSUE',
    message: 'That milestone cannot be used.',
  });

  expect(await actions.setIssueFilter({ milestone: '0' })).toBe(false);

  expect(useGitHub.getState()).toMatchObject({
    issueFilter: openFilter,
    issues: [issue, other],
    error: 'That milestone cannot be used.',
  });
});

test('another page of issues is appended without repeating one', async () => {
  await connect();
  const later = { ...other, number: 5, title: 'Later' };
  vi.mocked(github.issues).mockResolvedValue({
    items: [other, later],
    page: 2,
    hasMore: false,
    rate: null,
  });

  expect(await actions.moreIssues()).toBe(true);

  expect(useGitHub.getState().issues.map((entry) => entry.number)).toEqual([
    7, 6, 5,
  ]);
  expect(github.issues).toHaveBeenLastCalledWith('1', openFilter, 2);
  expect(useGitHub.getState().issuesMore).toBe(false);
});

test('labels, assignees and milestones are read once, until the next refresh', async () => {
  await connect();
  vi.mocked(github.issueChoices).mockResolvedValue(choices);

  await actions.loadChoices();
  await actions.loadChoices();
  expect(github.issueChoices).toHaveBeenCalledTimes(1);
  expect(useGitHub.getState().choices).toEqual(choices);

  await actions.refresh();
  expect(useGitHub.getState().choices).toBeNull();
  await actions.loadChoices();
  expect(github.issueChoices).toHaveBeenCalledTimes(2);
});

test('opening an issue reads it with its body', async () => {
  await connect();
  vi.mocked(github.issue).mockResolvedValue(detail());

  expect(await actions.openIssue(7)).toBe(true);

  expect(github.issue).toHaveBeenCalledWith('1', 7);
  expect(useGitHub.getState().selectedIssue?.body).toBe('Adımlar:\n1. aç');
});

test('an open issue is read again on refresh', async () => {
  await connect();
  vi.mocked(github.issue).mockResolvedValue(detail());
  await actions.openIssue(7);
  vi.mocked(github.issue).mockResolvedValue(detail({ title: 'Renamed' }));

  await actions.refresh();

  expect(github.issue).toHaveBeenCalledTimes(2);
  expect(useGitHub.getState().selectedIssue?.title).toBe('Renamed');
});

test('closing sends the chosen reason and moves the issue out of the open list', async () => {
  await connect();
  vi.mocked(github.issue).mockResolvedValue(detail());
  await actions.openIssue(7);
  vi.mocked(github.closeIssue).mockResolvedValue(
    detail({ state: 'closed', stateReason: 'not_planned' }),
  );

  expect(await actions.closeIssue('notPlanned')).toBe(true);

  expect(github.closeIssue).toHaveBeenCalledWith('1', 7, 'notPlanned');
  const state = useGitHub.getState();
  expect(state.issues.map((entry) => entry.number)).toEqual([6]);
  expect(state.selectedIssue?.state).toBe('closed');
  expect(state.notice).toBe('Issue #7 closed.');
});

test('reopening an issue in the closed list takes it out of that list', async () => {
  await connect();
  const closed = { ...issue, state: 'closed' as const };
  vi.mocked(github.issues).mockResolvedValue(page([closed]));
  await actions.setIssueFilter({ state: 'closed' });
  vi.mocked(github.issue).mockResolvedValue(detail({ state: 'closed' }));
  await actions.openIssue(7);
  vi.mocked(github.reopenIssue).mockResolvedValue(
    detail({ stateReason: 'reopened' }),
  );

  expect(await actions.reopenIssue()).toBe(true);

  expect(github.reopenIssue).toHaveBeenCalledWith('1', 7);
  expect(useGitHub.getState().issues).toEqual([]);
  expect(useGitHub.getState().notice).toBe('Issue #7 reopened.');
});

test('a closed issue that still matches the filter is updated in place', async () => {
  await connect();
  vi.mocked(github.issues).mockResolvedValue(
    page([{ ...issue, state: 'closed' }]),
  );
  await actions.setIssueFilter({ state: 'closed' });
  vi.mocked(github.issue).mockResolvedValue(detail({ state: 'closed' }));
  await actions.openIssue(7);
  vi.mocked(github.closeIssue).mockResolvedValue(
    detail({ state: 'closed', stateReason: 'not_planned' }),
  );

  await actions.closeIssue('notPlanned');

  expect(useGitHub.getState().issues[0].stateReason).toBe('not_planned');
});

test('creating sends the draft, clears it and re-reads the list', async () => {
  await connect();
  actions.compose(true);
  actions.editDraft({
    title: 'Yeni hata',
    body: 'Gövde',
    labels: ['bug'],
    assignees: ['oyku'],
    milestone: 2,
  });
  const created = detail({ number: 8, title: 'Yeni hata' });
  vi.mocked(github.createIssue).mockResolvedValue({
    issue: created,
    dropped: { labels: [], assignees: [], milestone: false },
  });
  vi.mocked(github.issues).mockClear();

  expect(await actions.createIssue()).toBe(true);

  expect(github.createIssue).toHaveBeenCalledWith('1', {
    title: 'Yeni hata',
    body: 'Gövde',
    labels: ['bug'],
    assignees: ['oyku'],
    milestone: 2,
  });
  expect(github.issues).toHaveBeenCalledWith('1', openFilter, 1);
  expect(useGitHub.getState()).toMatchObject({
    selectedIssue: created,
    composing: false,
    draft: { title: '', body: '', labels: [], assignees: [], milestone: null },
    notice: 'Issue #8 created.',
  });
});

test('metadata GitHub silently left out is reported after a create', async () => {
  await connect();
  actions.editDraft({ title: 'Başlık', labels: ['bug'], milestone: 2 });
  vi.mocked(github.createIssue).mockResolvedValue({
    issue: detail({ number: 8 }),
    dropped: { labels: ['bug'], assignees: [], milestone: true },
  });

  await actions.createIssue();

  expect(useGitHub.getState().notice).toBe(
    'GitHub created the issue without labels bug, the milestone. Only people with push access can set these.',
  );
});

test('a failed create keeps everything that was typed', async () => {
  await connect();
  actions.compose(true);
  actions.editDraft({ title: 'Başlık', body: 'Uzun bir açıklama' });
  vi.mocked(github.createIssue).mockRejectedValue({
    code: 'GITHUB_WRITE_UNCONFIRMED',
    message: 'GitHub did not confirm the change.',
  });

  expect(await actions.createIssue()).toBe(false);

  expect(useGitHub.getState()).toMatchObject({
    composing: true,
    draft: { title: 'Başlık', body: 'Uzun bir açıklama' },
    error: 'GitHub did not confirm the change.',
  });
});

test('a write refused for permission names the permission it needs', async () => {
  await connect();
  actions.editDraft({ title: 'Başlık' });
  vi.mocked(github.createIssue).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'Resource not accessible by personal access token',
  });

  await actions.createIssue();

  expect(useGitHub.getState().error).toContain('Issues: Read and write');
  expect(useGitHub.getState().account.status).toBe('signedIn');
});

test('a created issue is not reported as failed when the list cannot be re-read', async () => {
  await connect();
  actions.editDraft({ title: 'Başlık' });
  vi.mocked(github.createIssue).mockResolvedValue({
    issue: detail({ number: 8 }),
    dropped: { labels: [], assignees: [], milestone: false },
  });
  vi.mocked(github.issues).mockRejectedValue({
    code: 'GITHUB_TIMED_OUT',
    message: 'GitHub did not answer in time.',
  });

  expect(await actions.createIssue()).toBe(true);

  expect(useGitHub.getState()).toMatchObject({
    error: null,
    notice: 'Issue #8 created.',
    issuesError: 'GitHub did not answer in time.',
    selectedIssue: { number: 8 },
  });
});

test('the answer to a change for a replaced folder is discarded', async () => {
  await connect();
  vi.mocked(github.issue).mockResolvedValue(detail());
  await actions.openIssue(7);
  let release!: (value: GitHubIssueDetail) => void;
  vi.mocked(github.closeIssue).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const pending = actions.closeIssue('completed');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  useWorkspace.setState({ workspace: { ...workspace, id: '2' } });
  release(detail({ state: 'closed' }));

  expect(await pending).toBe(false);
  expect(useGitHub.getState().selectedIssue).toBeNull();
  expect(useGitHub.getState().issues).toEqual([]);
});

test('a second change started while one runs is refused', async () => {
  await connect();
  vi.mocked(github.issue).mockResolvedValue(detail());
  await actions.openIssue(7);
  let release!: (value: GitHubIssueDetail) => void;
  vi.mocked(github.closeIssue).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const first = actions.closeIssue('completed');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));

  expect(await actions.closeIssue('completed')).toBe(false);
  expect(await actions.createIssue()).toBe(false);

  release(detail({ state: 'closed' }));
  expect(await first).toBe(true);
  expect(github.closeIssue).toHaveBeenCalledTimes(1);
  expect(github.createIssue).not.toHaveBeenCalled();
});

test('opening another folder forgets the issues, the filter and the draft', async () => {
  await connect();
  await actions.setIssueFilter({ label: 'bug' });
  actions.editDraft({ title: 'Başlık' });
  vi.mocked(github.link).mockResolvedValue({ status: 'noRepository' });

  useWorkspace.setState({ workspace: { id: '2', name: 'o', path: 'C:/o' } });
  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('noRepository'),
  );

  expect(useGitHub.getState()).toMatchObject({
    issues: [],
    issueFilter: openFilter,
    draft: { title: '' },
    choices: null,
  });
});

test('issue labels explain state, filters and what GitHub left out', () => {
  expect(issueStateLabel(issue)).toBe('Open');
  expect(issueStateLabel({ ...issue, state: 'closed' })).toBe('Closed');
  expect(
    issueStateLabel({ ...issue, state: 'closed', stateReason: 'not_planned' }),
  ).toBe('Closed as not planned');
  expect(matchesFilter(issue, openFilter)).toBe(true);
  expect(matchesFilter(issue, { ...openFilter, label: 'BUG' })).toBe(true);
  expect(matchesFilter(issue, { ...openFilter, label: 'docs' })).toBe(false);
  expect(matchesFilter(issue, { ...openFilter, assignee: 'none' })).toBe(false);
  expect(matchesFilter(other, { ...openFilter, assignee: 'none' })).toBe(true);
  expect(matchesFilter(issue, { ...openFilter, milestone: '2' })).toBe(true);
  expect(matchesFilter(issue, { ...openFilter, milestone: 'none' })).toBe(
    false,
  );
  expect(matchesFilter(issue, { ...openFilter, state: 'closed' })).toBe(false);
  expect(
    droppedLabel({ labels: [], assignees: [], milestone: false }),
  ).toBeNull();
  expect(
    droppedLabel({ labels: [], assignees: ['oyku'], milestone: false }),
  ).toContain('assignees oyku');
});

test('one refresh also reads the first page of open pull requests', async () => {
  await connect();

  expect(github.pullRequests).toHaveBeenCalledWith('1', 'open', 1);
  expect(useGitHub.getState()).toMatchObject({
    pulls: [pull],
    pullsMore: true,
    pullsDenied: false,
    pullsError: null,
  });
});

test('switching to the pull requests tab reads nothing', async () => {
  await connect();
  vi.mocked(github.pullRequests).mockClear();

  actions.setTab('pulls');

  expect(useGitHub.getState().tab).toBe('pulls');
  expect(github.pullRequests).not.toHaveBeenCalled();
  expect(github.pullRequest).not.toHaveBeenCalled();
});

test('a token that cannot read pull requests leaves the rest of the refresh intact', async () => {
  vi.mocked(github.pullRequests).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'Resource not accessible by personal access token',
  });
  await connect();
  vi.mocked(github.pullRequests).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'Resource not accessible by personal access token',
  });
  await actions.refresh();

  expect(useGitHub.getState()).toMatchObject({
    repository,
    issues: [issue, other],
    pulls: [],
    pullsDenied: true,
    pullsError: null,
    error: null,
  });
});

test('another pull request failure is kept in the tab rather than the panel', async () => {
  await connect();
  vi.mocked(github.pullRequests).mockRejectedValue({
    code: 'GITHUB_UNAVAILABLE',
    message: 'GitHub is not answering correctly right now.',
  });

  await actions.refresh();

  expect(useGitHub.getState()).toMatchObject({
    repository,
    pullsDenied: false,
    pullsError: 'GitHub is not answering correctly right now.',
    error: null,
  });
});

test('the closed list is read, and the state is kept only once GitHub answers', async () => {
  await connect();
  const merged = { ...pull, number: 3, state: 'closed' as const, merged: true };
  vi.mocked(github.pullRequests).mockResolvedValueOnce(page([merged]));

  expect(await actions.setPullState('closed')).toBe(true);
  expect(github.pullRequests).toHaveBeenLastCalledWith('1', 'closed', 1);
  expect(useGitHub.getState()).toMatchObject({
    pullState: 'closed',
    pulls: [merged],
    pullsMore: false,
  });

  vi.mocked(github.pullRequests).mockRejectedValueOnce({
    code: 'GITHUB_TIMED_OUT',
    message: 'GitHub did not answer in time.',
  });
  expect(await actions.setPullState('open')).toBe(false);
  expect(useGitHub.getState()).toMatchObject({
    pullState: 'closed',
    pulls: [merged],
    error: 'GitHub did not answer in time.',
  });
});

test('another page of pull requests is appended without repeating one', async () => {
  await connect();
  const older = { ...pull, number: 11, title: 'Older' };
  vi.mocked(github.pullRequests).mockResolvedValueOnce(page([pull, older]));

  expect(await actions.morePulls()).toBe(true);

  expect(github.pullRequests).toHaveBeenLastCalledWith('1', 'open', 2);
  expect(useGitHub.getState().pulls.map((entry) => entry.number)).toEqual([
    12, 11,
  ]);
  expect(useGitHub.getState().pullsMore).toBe(false);
});

test('opening a pull request reads it with its checks and then its files', async () => {
  await connect();
  vi.mocked(github.pullRequest).mockResolvedValue(pullDetail());
  vi.mocked(github.pullFiles).mockResolvedValue(
    page([file('src/a.ts'), file('src/b.ts')], true),
  );

  expect(await actions.openPull(12)).toBe(true);

  expect(github.pullRequest).toHaveBeenCalledWith('1', 12);
  expect(github.pullFiles).toHaveBeenCalledWith('1', 12, 1);
  expect(useGitHub.getState()).toMatchObject({
    selectedPull: { number: 12, checks: { summary: 'passing' } },
    pullFiles: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }],
    pullFilesMore: true,
    pullFilesError: null,
  });

  vi.mocked(github.pullFiles).mockResolvedValueOnce(
    page([file('src/b.ts'), file('src/c.ts')]),
  );
  expect(await actions.moreFiles()).toBe(true);
  expect(github.pullFiles).toHaveBeenLastCalledWith('1', 12, 2);
  expect(useGitHub.getState().pullFiles.map((entry) => entry.path)).toEqual([
    'src/a.ts',
    'src/b.ts',
    'src/c.ts',
  ]);
});

test('files that cannot be read leave the pull request readable', async () => {
  await connect();
  vi.mocked(github.pullRequest).mockResolvedValue(pullDetail());
  vi.mocked(github.pullFiles).mockRejectedValue({
    code: 'GITHUB_RESPONSE_INVALID',
    message: 'GitHub returned more data than TBCE will read.',
  });

  expect(await actions.openPull(12)).toBe(true);

  expect(useGitHub.getState()).toMatchObject({
    selectedPull: { number: 12 },
    pullFiles: [],
    pullFilesError: 'GitHub returned more data than TBCE will read.',
    error: null,
  });
});

test('an open pull request and its patch are read again on refresh', async () => {
  await connect();
  vi.mocked(github.pullRequest).mockResolvedValue(pullDetail());
  vi.mocked(github.pullFiles).mockResolvedValue(
    page([file('src/a.ts', 'old'), file('src/b.ts')]),
  );
  await actions.openPull(12);
  actions.openPullFile(useGitHub.getState().pullFiles[0]);
  vi.mocked(github.pullRequest).mockResolvedValue(
    pullDetail({ title: 'Renamed on GitHub' }),
  );
  vi.mocked(github.pullFiles).mockResolvedValue(
    page([file('src/a.ts', 'new')]),
  );

  await actions.refresh();

  expect(useGitHub.getState().selectedPull?.title).toBe('Renamed on GitHub');
  expect(useGitHub.getState().pullFile).toEqual({
    number: 12,
    file: file('src/a.ts', 'new'),
  });

  vi.mocked(github.pullFiles).mockResolvedValue(page([file('src/b.ts')]));
  await actions.refresh();
  expect(useGitHub.getState().pullFile).toBeNull();
});

test('a pull request patch and a local diff never share the editor area', async () => {
  await connect();
  vi.mocked(github.pullRequest).mockResolvedValue(pullDetail());
  vi.mocked(github.pullFiles).mockResolvedValue(page([file('src/a.ts')]));
  await actions.openPull(12);
  useGit.setState({
    selected: { path: 'src/a.ts', staged: false },
    diff: null,
  });

  actions.openPullFile(useGitHub.getState().pullFiles[0]);

  expect(useGit.getState().selected).toBeNull();
  expect(useGitHub.getState().pullFile?.file.path).toBe('src/a.ts');
  expect(github.pullFiles).toHaveBeenCalledTimes(1);

  useGit.setState({ selected: { path: 'src/b.ts', staged: true } });
  expect(useGitHub.getState().pullFile).toBeNull();
});

test('the answer for a pull request of a replaced folder is discarded', async () => {
  await connect();
  let release!: (value: GitHubPullRequestDetail) => void;
  vi.mocked(github.pullRequest).mockImplementationOnce(
    () => new Promise((resolve) => (release = resolve)),
  );
  const pending = actions.openPull(12);
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  useWorkspace.setState({ workspace: { ...workspace, id: '2' } });
  release(pullDetail());

  expect(await pending).toBe(false);
  expect(useGitHub.getState().selectedPull).toBeNull();
  expect(github.pullFiles).not.toHaveBeenCalled();
});

test('opening another folder forgets the pull requests and the open patch', async () => {
  await connect();
  vi.mocked(github.pullRequest).mockResolvedValue(pullDetail());
  vi.mocked(github.pullFiles).mockResolvedValue(page([file('src/a.ts')]));
  await actions.setPullState('closed');
  await actions.openPull(12);
  actions.openPullFile(useGitHub.getState().pullFiles[0]);
  vi.mocked(github.link).mockResolvedValue({ status: 'noRepository' });

  useWorkspace.setState({ workspace: { id: '2', name: 'o', path: 'C:/o' } });
  await vi.waitFor(() =>
    expect(useGitHub.getState().link.status).toBe('noRepository'),
  );

  expect(useGitHub.getState()).toMatchObject({
    pulls: [],
    pullState: 'open',
    selectedPull: null,
    pullFiles: [],
    pullFile: null,
  });
});

test('going back to the list forgets the pull request and its patch', async () => {
  await connect();
  vi.mocked(github.pullRequest).mockResolvedValue(pullDetail());
  vi.mocked(github.pullFiles).mockResolvedValue(page([file('src/a.ts')]));
  await actions.openPull(12);
  actions.openPullFile(useGitHub.getState().pullFiles[0]);

  actions.backToPulls();

  expect(useGitHub.getState()).toMatchObject({
    selectedPull: null,
    pullFiles: [],
    pullFile: null,
    pulls: [pull],
  });
});

test('pull request labels explain state, source, checks and merging', () => {
  expect(pullStateLabel(pull)).toBe('Open');
  expect(pullStateLabel({ ...pull, draft: true })).toBe('Draft');
  expect(pullStateLabel({ ...pull, state: 'closed' })).toBe('Closed');
  expect(pullStateLabel({ ...pull, state: 'closed', merged: true })).toBe(
    'Merged',
  );
  expect(sourceLabel(pull)).toBe('feature/auth');
  expect(
    sourceLabel({
      ...pull,
      crossRepository: true,
      head: { ...pull.head, repository: 'someone/TBCE' },
    }),
  ).toBe('someone/TBCE:feature/auth');
  expect(
    sourceLabel({
      ...pull,
      crossRepository: true,
      head: { ...pull.head, repository: null },
    }),
  ).toBe('feature/auth (deleted fork)');
  const checks = pullDetail().checks;
  expect(checksLabel(checks)).toBe('All 1 checks passed');
  expect(
    checksLabel({
      ...checks,
      entries: [
        ...checks.entries,
        { ...checks.entries[0], name: 'docs', outcome: 'neutral' },
      ],
    }),
  ).toBe('1 passed, 1 skipped or neutral');
  expect(
    checksLabel({
      ...checks,
      summary: 'failing',
      entries: [{ ...checks.entries[0], outcome: 'failing' }],
    }),
  ).toBe('1 of 1 checks failing');
  expect(checksLabel({ ...checks, summary: 'none', entries: [] })).toBe(
    'No checks reported',
  );
  expect(mergeableLabel(pullDetail({ mergeable: null }))).toBe('Not yet known');
  expect(mergeableLabel(pullDetail({ mergeable: false }))).toBe(
    'Has conflicts',
  );
  expect(mergeableLabel(pullDetail({ mergeableState: 'blocked' }))).toBe(
    'Blocked by branch rules',
  );
  expect(mergeableLabel(pullDetail({ merged: true, state: 'closed' }))).toBe(
    '—',
  );
});
