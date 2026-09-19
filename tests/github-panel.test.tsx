import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GitHubPanel } from '../src/github/GitHubPanel';
import { useGitHub } from '../src/stores/github';
import { useWorkspace } from '../src/stores/workspace';
import { github } from '../src/services/github';
import { fileSystem } from '../src/services/filesystem';
import { ask } from '../src/stores/dialog';
import type {
  GitHubAccount,
  GitHubBranch,
  GitHubCommit,
  GitHubIssue,
  GitHubIssueDetail,
  GitHubLink,
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
vi.mock('../src/stores/dialog', () => ({ ask: vi.fn() }));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const signedIn: GitHubAccount = {
  status: 'signedIn',
  login: 'octocat',
  name: 'Öykü Çelik',
  scopes: ['repo'],
  rate: { limit: 5000, remaining: 4990, reset: 1789000000 },
};
const found: GitHubLink = {
  status: 'found',
  remote: 'origin',
  owner: 'MYY-sudo',
  repo: 'TBCE',
};
const repository: GitHubRepository = {
  owner: 'MYY-sudo',
  name: 'TBCE',
  fullName: 'MYY-sudo/TBCE',
  description: 'Tools, Branches, Code, Everything',
  defaultBranch: 'main',
  private: true,
  fork: false,
  archived: false,
  stars: 3,
  forks: 1,
  watchers: 3,
  openIssuesAndPullRequests: 7,
  hasIssues: true,
  pushedAt: '2026-09-17T09:00:00Z',
  language: 'Rust',
  url: 'https://github.com/MYY-sudo/TBCE',
  rate: { limit: 5000, remaining: 4988, reset: 1789000000 },
};
const page = <T,>(items: T[], hasMore = false): GitHubPage<T> => ({
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
const detail = (
  changes: Partial<GitHubIssueDetail> = {},
): GitHubIssueDetail => ({
  ...issue,
  body: 'Adımlar:\n1. aç',
  rate: null,
  ...changes,
});
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useGitHub.setState(useGitHub.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  vi.mocked(github.account).mockResolvedValue({ status: 'signedOut' });
  vi.mocked(github.link).mockResolvedValue({ status: 'noRepository' });
  vi.mocked(github.repository).mockResolvedValue(repository);
  vi.mocked(github.branches).mockResolvedValue(page([branch]));
  vi.mocked(github.commits).mockResolvedValue(page([commit], true));
  vi.mocked(github.activity).mockResolvedValue(page([]));
  vi.mocked(github.issues).mockResolvedValue(page([issue]));
  vi.mocked(github.pullRequests).mockResolvedValue(page([]));
  vi.mocked(github.issueChoices).mockResolvedValue({
    labels: [
      { name: 'bug', color: 'd73a4a', description: 'Something is broken' },
      { name: 'docs', color: null, description: null },
    ],
    assignees: ['octocat', 'oyku'],
    milestones: [{ number: 2, title: 'V1', dueOn: null }],
    truncated: false,
    rate: null,
  });
});
/// Renders the panel with an account and a linked repository already read.
async function open(link: GitHubLink = found) {
  vi.mocked(github.account).mockResolvedValue(signedIn);
  vi.mocked(github.link).mockResolvedValue(link);
  useWorkspace.setState({ workspace });
  render(<GitHubPanel />);
  await vi.waitFor(() =>
    expect(useGitHub.getState().account.status).toBe('signedIn'),
  );
  await vi.waitFor(() => expect(useGitHub.getState().dataBusy).toBe(false));
}

test('a panel with no account offers to connect and reads nothing', async () => {
  render(<GitHubPanel />);

  expect(await screen.findByText('NOT CONNECTED')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Connect account' }),
  ).toBeInTheDocument();
  await vi.waitFor(() => expect(github.account).toHaveBeenCalled());
  expect(github.repository).not.toHaveBeenCalled();
  expect(github.branches).not.toHaveBeenCalled();
  expect(github.commits).not.toHaveBeenCalled();
});

test('the token is asked for in a masked field and never shown afterwards', async () => {
  vi.mocked(ask).mockResolvedValue('ghp_token');
  vi.mocked(github.signIn).mockResolvedValue(signedIn);
  render(<GitHubPanel />);

  fireEvent.click(
    await screen.findByRole('button', { name: 'Connect account' }),
  );

  await vi.waitFor(() =>
    expect(github.signIn).toHaveBeenCalledWith('ghp_token'),
  );
  expect(vi.mocked(ask).mock.calls[0][0]).toMatchObject({
    secret: true,
    label: 'Personal access token',
  });
  expect(
    await screen.findByText('octocat', { exact: false }),
  ).toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain('ghp_token');
});

test('a cancelled connection changes nothing', async () => {
  vi.mocked(ask).mockResolvedValue(null);
  render(<GitHubPanel />);

  fireEvent.click(
    await screen.findByRole('button', { name: 'Connect account' }),
  );

  await vi.waitFor(() => expect(ask).toHaveBeenCalled());
  expect(github.signIn).not.toHaveBeenCalled();
  expect(useGitHub.getState().account.status).toBe('signedOut');
});

test('a connected account with no folder explains itself and reads nothing', async () => {
  vi.mocked(github.account).mockResolvedValue(signedIn);
  render(<GitHubPanel />);

  expect(await screen.findByText(/No folder is open/)).toBeInTheDocument();
  expect(github.link).not.toHaveBeenCalled();
  expect(github.repository).not.toHaveBeenCalled();
});

test('a repository whose remote is elsewhere names the host and reads nothing', async () => {
  await open({ status: 'notGitHub', remote: 'origin', host: 'gitlab.com' });

  expect(await screen.findByRole('status')).toHaveTextContent(
    /origin remote points at gitlab.com/,
  );
  expect(screen.getByText('NO REMOTE')).toBeInTheDocument();
  expect(github.repository).not.toHaveBeenCalled();
});

test('a repository with no remote at all is a state, not an error', async () => {
  await open({ status: 'noRemote' });

  expect(
    await screen.findByText(/This repository has no remote/),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(github.repository).not.toHaveBeenCalled();
});

test('a missing Git is explained without blaming the folder', async () => {
  await open({
    status: 'unavailable',
    code: 'GIT_MISSING',
    message: 'Git was not found.',
  });

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Git was not found. Editing this folder is unaffected.',
  );
});

test('the overview reports what GitHub reported, counts included', async () => {
  await open();

  expect(await screen.findByText('MYY-sudo/TBCE')).toBeInTheDocument();
  expect(
    screen.getByText('Tools, Branches, Code, Everything'),
  ).toBeInTheDocument();
  expect(screen.getByText('private')).toBeInTheDocument();
  expect(screen.getByText('Default branch')).toBeInTheDocument();
  expect(screen.getByText('main')).toBeInTheDocument();
  expect(screen.getByText('Rust')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
  // The combined count is labelled as combined rather than presented as an issue count.
  expect(
    screen.getByText(/counts open issues and pull requests together/),
  ).toBeInTheDocument();
  expect(screen.getByText('CONNECTED')).toBeInTheDocument();
});

test('the rate limit is shown so an exhausted allowance is visible before it bites', async () => {
  await open();

  expect(
    await screen.findByText(/4988 of 5000 requests left/),
  ).toBeInTheDocument();
});

test('switching to branches and commits shows them without reading again', async () => {
  await open();
  vi.mocked(github.branches).mockClear();
  vi.mocked(github.commits).mockClear();

  fireEvent.click(screen.getByRole('tab', { name: 'Branches' }));
  expect(await screen.findByText('REMOTE BRANCHES')).toBeInTheDocument();
  expect(screen.getByText('protected')).toBeInTheDocument();
  expect(screen.getByText('aaaaaaa')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Commits' }));
  expect(await screen.findByText('feat: add the panel')).toBeInTheDocument();
  expect(screen.getByText('bbbbbbb')).toBeInTheDocument();

  expect(github.branches).not.toHaveBeenCalled();
  expect(github.commits).not.toHaveBeenCalled();
});

test('another page of commits is appended to the ones already shown', async () => {
  await open();
  fireEvent.click(screen.getByRole('tab', { name: 'Commits' }));
  vi.mocked(github.commits).mockResolvedValue({
    items: [
      {
        ...commit,
        oid: 'c'.repeat(40),
        short: 'ccccccc',
        summary: 'fix: later',
      },
    ],
    page: 2,
    hasMore: false,
    rate: null,
  });

  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more commits' }),
  );

  expect(await screen.findByText('fix: later')).toBeInTheDocument();
  expect(screen.getByText('feat: add the panel')).toBeInTheDocument();
  expect(github.commits).toHaveBeenLastCalledWith('1', 2);
});

test('refused activity is explained where it would have been shown', async () => {
  vi.mocked(github.activity).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'no access',
  });
  await open();

  expect(
    await screen.findByText(/cannot read repository activity/),
  ).toBeInTheDocument();
  expect(screen.getByText('MYY-sudo/TBCE')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a refused read is reported and the panel stays usable', async () => {
  vi.mocked(github.repository).mockRejectedValue({
    code: 'GITHUB_RATE_LIMITED',
    message: "GitHub's rate limit is used up.",
  });
  await open();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    "GitHub's rate limit is used up.",
  );
  expect(
    screen.getByRole('button', { name: 'Disconnect account' }),
  ).toBeEnabled();
});

test('disconnecting forgets the account and the repository', async () => {
  await open();
  vi.mocked(github.signOut).mockResolvedValue(undefined);

  fireEvent.click(screen.getByRole('button', { name: 'Disconnect account' }));

  expect(await screen.findByText('NOT CONNECTED')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Connect account' }),
  ).toBeInTheDocument();
});

test('a read in flight disables paging but never disconnecting', async () => {
  await open();
  fireEvent.click(screen.getByRole('tab', { name: 'Commits' }));
  await screen.findByRole('button', { name: 'Load more commits' });

  useGitHub.setState({ dataBusy: true });

  await vi.waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Load more commits' }),
    ).toBeDisabled(),
  );
  expect(
    screen.getByRole('button', { name: 'Disconnect account' }),
  ).toBeEnabled();
});

test('a revoked token exposes reconnection and removes stale repository content', async () => {
  await open();
  await screen.findByText(repository.description!);
  vi.mocked(github.repository).mockRejectedValueOnce({
    code: 'GITHUB_AUTH_FAILED',
    message: 'Connect the account again.',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh GitHub' }));
  expect(
    await screen.findByRole('button', { name: 'Connect account' }),
  ).toBeEnabled();
  expect(screen.queryByText(repository.description!)).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Connect the account again.',
  );
});

test.each([
  ['GITHUB_NETWORK_FAILED', 'Check your connection.'],
  ['GITHUB_RATE_LIMITED', 'Try again after the rate limit resets.'],
])(
  'activity %s shows recovery information without a permission warning',
  async (code, message) => {
    vi.mocked(github.activity).mockRejectedValue({ code, message });
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/cannot read repository activity/)).toBeNull();
    expect(screen.queryByText('No recent activity reported.')).toBeNull();
    expect(screen.getByText(repository.description!)).toBeInTheDocument();
  },
);

async function issuesTab() {
  await open();
  fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));
  await screen.findByText('OPEN ISSUES');
}

test('the issues tab shows what the refresh read without reading again', async () => {
  await open();
  vi.mocked(github.issues).mockClear();

  fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));

  expect(await screen.findByText('Kaydetme çöküyor')).toBeInTheDocument();
  expect(screen.getByText('bug')).toBeInTheDocument();
  expect(screen.getByText(/#7 · oyku/)).toHaveTextContent(/V1 · octocat/);
  expect(github.issues).not.toHaveBeenCalled();
});

test('an issue body is shown as text and never interpreted as markup', async () => {
  vi.mocked(github.issue).mockResolvedValue(
    detail({
      body: '<img src=x onerror="alert(1)"><b>kalın</b>\n**markdown**',
    }),
  );
  await issuesTab();

  fireEvent.click(screen.getByRole('button', { name: /Kaydetme çöküyor/ }));

  const body = await screen.findByText(/<img src=x/);
  expect(body.tagName).toBe('PRE');
  expect(body).toHaveTextContent('**markdown**');
  expect(document.querySelector('.github-body img')).toBeNull();
  expect(document.querySelector('.github-body b')).toBeNull();
  expect(github.issue).toHaveBeenCalledWith('1', 7);
});

test('closing asks for a reason, and cancelling sends nothing', async () => {
  vi.mocked(github.issue).mockResolvedValue(detail());
  await issuesTab();
  fireEvent.click(screen.getByRole('button', { name: /Kaydetme çöküyor/ }));
  const close = await screen.findByRole('button', { name: 'Close issue' });

  vi.mocked(ask).mockResolvedValueOnce(null);
  fireEvent.click(close);
  await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  expect(vi.mocked(ask).mock.calls[0][0].actions.map((a) => a.value)).toEqual([
    'cancel',
    'notPlanned',
    'completed',
  ]);
  expect(github.closeIssue).not.toHaveBeenCalled();

  vi.mocked(ask).mockResolvedValueOnce('notPlanned');
  vi.mocked(github.closeIssue).mockResolvedValue(
    detail({ state: 'closed', stateReason: 'not_planned' }),
  );
  fireEvent.click(close);

  await vi.waitFor(() =>
    expect(github.closeIssue).toHaveBeenCalledWith('1', 7, 'notPlanned'),
  );
  expect(
    await screen.findByRole('button', { name: 'Reopen issue' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Closed as not planned')).toBeInTheDocument();
});

test('the new issue form sends title, body, labels, assignees and milestone', async () => {
  vi.mocked(github.createIssue).mockResolvedValue({
    issue: detail({ number: 8, title: 'Yeni' }),
    dropped: { labels: [], assignees: ['oyku'], milestone: false },
  });
  await issuesTab();

  fireEvent.click(screen.getByRole('button', { name: 'New issue' }));
  const create = await screen.findByRole('button', { name: 'Create issue' });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Yeni' },
  });
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Gövde' },
  });
  fireEvent.click(await screen.findByRole('checkbox', { name: /bug/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'oyku' }));
  fireEvent.change(screen.getByLabelText('Milestone'), {
    target: { value: '2' },
  });
  fireEvent.click(create);

  await vi.waitFor(() =>
    expect(github.createIssue).toHaveBeenCalledWith('1', {
      title: 'Yeni',
      body: 'Gövde',
      labels: ['bug'],
      assignees: ['oyku'],
      milestone: 2,
    }),
  );
  expect(
    await screen.findByText(/created the issue without assignees oyku/),
  ).toBeInTheDocument();
  expect(github.issueChoices).toHaveBeenCalledTimes(1);
});

test('filters send the chosen value and can be cleared', async () => {
  await issuesTab();

  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  await vi.waitFor(() => expect(github.issueChoices).toHaveBeenCalled());
  const label = screen.getByLabelText('Label');
  await vi.waitFor(() => expect(label).toBeEnabled());
  fireEvent.change(label, { target: { value: 'bug' } });

  await vi.waitFor(() =>
    expect(github.issues).toHaveBeenLastCalledWith(
      '1',
      { state: 'open', label: 'bug', assignee: null, milestone: null },
      1,
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
  await vi.waitFor(() =>
    expect(github.issues).toHaveBeenLastCalledWith(
      '1',
      { state: 'open', label: null, assignee: null, milestone: null },
      1,
    ),
  );
});

test('the closed issues are one press away', async () => {
  await issuesTab();
  vi.mocked(github.issues).mockResolvedValue(page([]));

  fireEvent.click(screen.getByRole('button', { name: 'Closed' }));

  expect(await screen.findByText('No closed issues.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Closed' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a repository with issues turned off says so and asks nothing', async () => {
  vi.mocked(github.repository).mockResolvedValue({
    ...repository,
    hasIssues: false,
  });
  await open();

  fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));

  expect(
    await screen.findByText('Issues are turned off for this repository.'),
  ).toBeInTheDocument();
  expect(github.issues).not.toHaveBeenCalled();
});

test('a token that cannot read issues is explained in the tab alone', async () => {
  vi.mocked(github.issues).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'no access',
  });
  await open();
  expect(screen.queryByRole('alert')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));

  expect(await screen.findByText(/cannot read issues/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New issue' })).toBeDisabled();
});

test('a change in flight disables every issue action', async () => {
  vi.mocked(github.issue).mockResolvedValue(detail());
  await issuesTab();
  fireEvent.click(screen.getByRole('button', { name: /Kaydetme çöküyor/ }));
  await screen.findByRole('button', { name: 'Close issue' });

  useGitHub.setState({ dataBusy: true });

  await vi.waitFor(() =>
    expect(screen.getByRole('button', { name: 'Close issue' })).toBeDisabled(),
  );
  expect(screen.getByRole('button', { name: 'Back to issues' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Disconnect account' }),
  ).toBeEnabled();
});

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
  labels: [{ name: 'ui', color: 'a2eeef' }],
  assignees: [],
  reviewers: ['octocat', 'Core'],
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
  comments: 1,
  reviewComments: 2,
  mergeable: null,
  mergeableState: 'unknown',
  checks: {
    summary: 'failing',
    entries: [
      {
        name: 'build',
        source: 'run',
        outcome: 'failing',
        state: 'timed_out',
        description: 'GitHub Actions',
      },
      {
        name: 'ci/legacy',
        source: 'status',
        outcome: 'passing',
        state: 'success',
        description: null,
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
const changed: GitHubPullFile[] = [
  {
    path: 'src/auth.ts',
    previousPath: null,
    status: 'modified',
    additions: 8,
    deletions: 1,
    patch: '@@ -1 +1 @@\n-a\n+b',
  },
  {
    path: 'src/login.ts',
    previousPath: 'src/signin.ts',
    status: 'renamed',
    additions: 2,
    deletions: 0,
    patch: null,
  },
];
async function pullsTab() {
  vi.mocked(github.pullRequests).mockResolvedValue(page([pull], true));
  await open();
  fireEvent.click(screen.getByRole('tab', { name: 'Pull requests' }));
  await screen.findByText('OPEN PULL REQUESTS');
}
async function openPull(detail = pullDetail()) {
  vi.mocked(github.pullRequest).mockResolvedValue(detail);
  vi.mocked(github.pullFiles).mockResolvedValue(page(changed));
  await pullsTab();
  fireEvent.click(screen.getByRole('button', { name: /Oturum açma akışı/ }));
  await screen.findByText('CHANGED FILES');
}

test('the pull requests tab shows what the refresh read without reading again', async () => {
  await pullsTab();
  vi.mocked(github.pullRequests).mockClear();

  expect(screen.getByText('Oturum açma akışı')).toBeInTheDocument();
  expect(screen.getByText('feature/auth → main')).toBeInTheDocument();
  expect(screen.getByText(/#12 · oyku · Open/)).toBeInTheDocument();
  expect(screen.getByText('ui')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Load more pull requests' }),
  ).toBeEnabled();
  expect(github.pullRequests).not.toHaveBeenCalled();
  expect(github.pullRequest).not.toHaveBeenCalled();
});

test('merged, closed, draft and forked pull requests read as what they are', async () => {
  vi.mocked(github.pullRequests).mockResolvedValue(
    page([
      {
        ...pull,
        number: 1,
        title: 'Merged one',
        state: 'closed',
        merged: true,
      },
      { ...pull, number: 2, title: 'Closed one', state: 'closed' },
      { ...pull, number: 3, title: 'Draft one', draft: true },
      {
        ...pull,
        number: 4,
        title: 'Fork one',
        crossRepository: true,
        head: { ...pull.head, repository: 'someone/TBCE' },
      },
      {
        ...pull,
        number: 5,
        title: 'Gone one',
        crossRepository: true,
        head: { ...pull.head, repository: null },
      },
    ]),
  );
  await open();
  fireEvent.click(screen.getByRole('tab', { name: 'Pull requests' }));

  expect(await screen.findByText(/#1 · oyku · Merged/)).toBeInTheDocument();
  expect(screen.getByText(/#2 · oyku · Closed/)).toBeInTheDocument();
  expect(screen.getByText(/#3 · oyku · Draft/)).toBeInTheDocument();
  expect(
    screen.getByText('someone/TBCE:feature/auth → main'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('feature/auth (deleted fork) → main'),
  ).toBeInTheDocument();
});

test('the closed pull requests are one press away', async () => {
  await pullsTab();
  vi.mocked(github.pullRequests).mockResolvedValue(page([]));

  fireEvent.click(screen.getByRole('button', { name: 'Closed' }));

  expect(
    await screen.findByText('No closed pull requests.'),
  ).toBeInTheDocument();
  expect(github.pullRequests).toHaveBeenLastCalledWith('1', 'closed', 1);
});

test('a pull request shows its branches, people, counts and checks', async () => {
  await openPull();

  expect(github.pullRequest).toHaveBeenCalledWith('1', 12);
  expect(github.pullFiles).toHaveBeenCalledWith('1', 12, 1);
  expect(screen.getByText('Source').nextSibling).toHaveTextContent(
    'feature/auth',
  );
  expect(screen.getByText('Target').nextSibling).toHaveTextContent('main');
  expect(screen.getByText('octocat, Core')).toBeInTheDocument();
  expect(screen.getByText('Not yet known')).toBeInTheDocument();
  expect(screen.getByText('2 commits')).toBeInTheDocument();
  expect(screen.getByText('3 comments')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 of 2 checks failing');
  expect(screen.getByText('build')).toBeInTheDocument();
  expect(screen.getByText('timed out')).toBeInTheDocument();
  expect(screen.getByText('ci/legacy')).toBeInTheDocument();
  expect(screen.getByText(/not part of this release/)).toBeInTheDocument();
});

test('a pull request description is shown as text and never interpreted as markup', async () => {
  await openPull(
    pullDetail({
      body: '<img src=x onerror="alert(1)"><b>kalın</b>\n## başlık',
    }),
  );

  const body = screen.getByText(/<img src=x/);
  expect(body.tagName).toBe('PRE');
  expect(body).toHaveTextContent('## başlık');
  expect(document.querySelector('.github-body img')).toBeNull();
  expect(document.querySelector('.github-body b')).toBeNull();
});

test('refused and failed checks are explained beside the pull request', async () => {
  await openPull(
    pullDetail({
      checks: {
        summary: 'none',
        entries: [],
        truncated: false,
        runsDenied: true,
        statusesDenied: true,
        missing: false,
        error: null,
      },
    }),
  );

  expect(screen.getByText(/cannot read check runs/)).toBeInTheDocument();
  expect(screen.getByText(/cannot read commit statuses/)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('No checks reported');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('changed files are listed and a press opens the patch without a request', async () => {
  await openPull();
  vi.mocked(github.pullFiles).mockClear();

  expect(
    screen.getByRole('button', { name: /src\/signin.ts → src\/login.ts/ }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /src\/auth.ts/ }));

  expect(useGitHub.getState().pullFile).toEqual({
    number: 12,
    file: changed[0],
  });
  expect(github.pullFiles).not.toHaveBeenCalled();
});

test('a token that cannot read pull requests is explained in the tab alone', async () => {
  vi.mocked(github.pullRequests).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'no access',
  });
  await open();
  expect(screen.queryByRole('alert')).toBeNull();

  fireEvent.click(screen.getByRole('tab', { name: 'Pull requests' }));

  expect(
    await screen.findByText(/cannot read pull requests/),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a read in flight disables every pull request action', async () => {
  await openPull();

  useGitHub.setState({ dataBusy: true });

  await vi.waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Back to pull requests' }),
    ).toBeDisabled(),
  );
  expect(screen.getByRole('button', { name: /src\/auth.ts/ })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Disconnect account' }),
  ).toBeEnabled();
});
