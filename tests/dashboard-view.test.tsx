import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Dashboard from '../src/dashboard/Dashboard';
import { useDashboard } from '../src/stores/dashboard';
import { useGitHub } from '../src/stores/github';
import { useGit } from '../src/stores/git';
import { useProject } from '../src/stores/project';
import { useWorkspace } from '../src/stores/workspace';
import { useProgress } from '../src/stores/progress';
import { github } from '../src/services/github';
import { progress } from '../src/services/progress';
import { git } from '../src/services/git';
import { projects } from '../src/services/project';
import { fileSystem } from '../src/services/filesystem';
import type {
  GitHubAccount,
  GitHubHeadChecks,
  GitHubRepository,
} from '../src/types/github';
import type { GitRepository } from '../src/types/git';
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
    areaIssues: vi.fn(),
    issueChoices: vi.fn(),
  },
}));
vi.mock('../src/services/progress', () => ({
  progress: { read: vi.fn(), write: vi.fn() },
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
  projects: { detect: vi.fn() },
}));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const signedIn: GitHubAccount = {
  status: 'signedIn',
  login: 'octocat',
  name: null,
  scopes: [],
  rate: null,
};
const local: GitRepository = {
  root: 'C:/code/app',
  gitDir: 'C:/code/app/.git',
  commonDir: 'C:/code/app/.git',
  linkedWorktree: false,
  bare: false,
  head: {
    kind: 'branch',
    name: 'feature/auth',
    oid: '0123456789abcdef0123456789abcdef01234567',
  },
};
const repository: GitHubRepository = {
  owner: 'MYY-sudo',
  name: 'TBCE',
  fullName: 'MYY-sudo/TBCE',
  description: '<img src=x onerror="alert(1)"><b>Tools</b>',
  defaultBranch: 'main',
  private: true,
  fork: false,
  archived: false,
  stars: 1,
  forks: 0,
  watchers: 1,
  openIssuesAndPullRequests: 15,
  hasIssues: true,
  pushedAt: null,
  language: 'TypeScript',
  url: null,
  rate: null,
};
const checks = (changes: Partial<GitHubHeadChecks['checks']> = {}) => ({
  summary: 'passing' as const,
  entries: [
    {
      name: 'build',
      source: 'run' as const,
      outcome: 'passing' as const,
      state: 'success',
      description: null,
    },
  ],
  truncated: false,
  runsDenied: false,
  statusesDenied: false,
  missing: false,
  error: null,
  ...changes,
});
const page = <T,>(items: T[], hasMore = false) => ({
  items,
  page: 1,
  hasMore,
  rate: null,
});
beforeEach(() => {
  vi.resetAllMocks();
  useDashboard.setState(useDashboard.getInitialState(), true);
  useGitHub.setState(useGitHub.getInitialState(), true);
  useGit.setState(useGit.getInitialState(), true);
  useProject.setState({ ...useProject.getInitialState(), recent: [] }, true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useProgress.setState(useProgress.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  vi.mocked(progress.read).mockResolvedValue({
    status: 'found',
    revision: 'r1',
    plan: {
      areas: [
        {
          id: 'a1',
          name: 'Authentication',
          label: 'area:auth',
          milestone: 2,
          tasks: [
            { id: 't1', title: 'Login', done: true },
            { id: 't2', title: 'Register', done: false },
          ],
        },
        {
          id: 'a2',
          name: 'Teams',
          label: null,
          milestone: null,
          tasks: [{ id: 't3', title: 'Invitations', done: false }],
        },
      ],
    },
  });
  vi.mocked(github.areaIssues).mockResolvedValue({
    issues: [
      { number: 5, title: 'OAuth', state: 'closed', notPlanned: false },
      { number: 6, title: 'SSO', state: 'open', notPlanned: false },
      { number: 7, title: 'LDAP', state: 'closed', notPlanned: true },
    ],
    truncated: false,
    rate: null,
  });
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'found',
    path: 'C:/code/app/.tbce/project.json',
    manifest: {
      schemaVersion: 1,
      name: 'Kütüphane',
      stack: 'nextjs-typescript',
      architecture: 'modular-monolith',
      defaultBranch: 'main',
      commands: { dev: 'npm run dev', test: 'npm test' },
    },
  });
  vi.mocked(git.detect).mockResolvedValue({
    status: 'found',
    repository: local,
  });
  vi.mocked(git.status).mockResolvedValue({
    repository: local,
    branch: 'feature/auth',
    upstream: 'origin/feature/auth',
    ahead: 2,
    behind: 0,
    staged: [{ path: 'a.ts', originalPath: null, state: 'modified' }],
    unstaged: [{ path: 'b.ts', originalPath: null, state: 'modified' }],
    untracked: ['c.ts'],
    conflicts: [],
  });
  vi.mocked(git.branches).mockResolvedValue({
    current: 'feature/auth',
    detached: false,
    defaultBranch: 'main',
    local: [
      {
        name: 'old',
        oid: 'a',
        upstream: 'origin/old',
        ahead: null,
        behind: null,
        gone: true,
        current: false,
        worktree: null,
        remote: false,
      },
    ],
    remote: [],
  });
  vi.mocked(git.history).mockResolvedValue({
    commits: [
      {
        oid: 'f'.repeat(40),
        shortOid: 'fffffff',
        parents: [],
        author: 'Öykü',
        email: 'o@example.com',
        authoredAt: '2026-09-18T10:00:00Z',
        committedAt: '2026-09-18T10:00:00Z',
        summary: 'Giriş ekranı eklendi',
        refs: [],
      },
    ],
    skip: 0,
    hasMore: false,
  });
  vi.mocked(git.diffSummary).mockResolvedValue([]);
  vi.mocked(github.account).mockResolvedValue(signedIn);
  vi.mocked(github.link).mockResolvedValue({
    status: 'found',
    remote: 'origin',
    owner: 'MYY-sudo',
    repo: 'TBCE',
  });
  vi.mocked(github.repository).mockResolvedValue(repository);
  vi.mocked(github.branches).mockResolvedValue(page([]));
  vi.mocked(github.commits).mockResolvedValue(page([]));
  vi.mocked(github.activity).mockResolvedValue(
    page([
      {
        kind: 'push',
        reference: 'refs/heads/main',
        actor: 'octocat',
        oid: 'abc',
        timestamp: '2026-09-18T11:00:00Z',
      },
    ]),
  );
  vi.mocked(github.issues).mockResolvedValue(page([]));
  vi.mocked(github.pullRequests).mockResolvedValue(page([]));
  vi.mocked(github.counts).mockResolvedValue({
    openPullRequests: 3,
    openIssues: 12,
    issuesDisabled: false,
    rate: null,
  });
  vi.mocked(github.milestones).mockResolvedValue(
    page(
      [
        {
          number: 2,
          title: 'V1',
          dueOn: '2026-10-01T07:00:00Z',
          openIssues: 1,
          closedIssues: 3,
        },
      ],
      true,
    ),
  );
  vi.mocked(github.headChecks).mockResolvedValue({
    oid: local.head.kind === 'branch' ? local.head.oid : null,
    checks: checks(),
    rate: null,
  });
});
const card = (name: string) => screen.getByRole('region', { name });
async function show(onNavigate = vi.fn()) {
  useWorkspace.setState({ workspace });
  render(<Dashboard onNavigate={onNavigate} />);
  await vi.waitFor(() => expect(useDashboard.getState().head).not.toBeNull());
  await vi.waitFor(() =>
    expect(useGitHub.getState().repository).not.toBeNull(),
  );
  return onNavigate;
}

test('every card reports the project it was read from', async () => {
  await show();

  expect(
    screen.getByRole('heading', { level: 1, name: 'Kütüphane' }),
  ).toBeInTheDocument();
  expect(within(card('Repository')).getByText('MYY-sudo/TBCE')).toBeVisible();
  expect(
    within(card('Repository')).getByText('nextjs-typescript'),
  ).toBeVisible();
  expect(await within(card('Git state')).findByText('3')).toBeVisible();
  expect(
    within(card('Git state')).getByText(
      'origin/feature/auth · 2 ahead, 0 behind',
    ),
  ).toBeVisible();
  expect(within(card('Branch')).getByText('feature/auth')).toBeVisible();
  expect(within(card('Branch')).getByRole('status')).toHaveTextContent(
    'Upstream gone for old',
  );
  expect(within(card('Issues')).getByText('12')).toBeVisible();
  expect(within(card('Pull requests')).getByText('3')).toBeVisible();
  expect(within(card('Build')).getByRole('status')).toHaveTextContent(
    'All 1 checks passed',
  );
  expect(within(card('Build')).getByText('0123456')).toBeVisible();
  expect(within(card('Commands')).getByText('npm run dev')).toBeVisible();
  expect(within(card('Commands')).getByText(/Milestone 13/)).toBeVisible();
  expect(
    within(card('Milestones')).getByRole('progressbar', {
      name: 'V1 progress',
    }),
  ).toHaveAttribute('aria-valuenow', '75');
  expect(within(card('Milestones')).getByText(/thirty shown/)).toBeVisible();
  const progressCard = card('Project progress');
  // Authentication: one of two tasks and one of two issues, with the issue closed as not planned
  // left out. Teams: none of one task. Five items, two done.
  expect(
    await within(progressCard).findByText(/1 of 2 tasks · 1 of 2 issues/),
  ).toBeVisible();
  expect(
    within(progressCard).getByText(/1 not planned, left out/),
  ).toBeVisible();
  expect(
    within(progressCard).getByRole('progressbar', {
      name: 'Authentication progress',
    }),
  ).toHaveAttribute('aria-valuenow', '50');
  expect(
    within(progressCard).getByRole('progressbar', { name: 'Project progress' }),
  ).toHaveAttribute('aria-valuenow', '40');
  expect(within(progressCard).getByText('2 of 5 done')).toBeVisible();
  expect(github.areaIssues).toHaveBeenCalledWith('1', 'area:auth', 2);
  expect(github.areaIssues).toHaveBeenCalledTimes(1);
  expect(
    await within(card('Recent commits')).findByText('Giriş ekranı eklendi'),
  ).toBeVisible();
  expect(
    within(card('Recent activity')).getByText('push · main'),
  ).toBeVisible();
});

test('a description containing HTML is shown as text', async () => {
  await show();

  expect(
    within(card('Repository')).getByText(
      '<img src=x onerror="alert(1)"><b>Tools</b>',
    ),
  ).toBeVisible();
  expect(document.querySelector('.dashboard img')).toBeNull();
  expect(document.querySelector('.dashboard b')).toBeNull();
});

test('signed out, only local cards are read and the GitHub cards say how to connect', async () => {
  vi.mocked(github.account).mockResolvedValue({ status: 'signedOut' });
  useWorkspace.setState({ workspace });
  render(<Dashboard onNavigate={vi.fn()} />);

  expect(
    await within(card('Git state')).findByText('changed files'),
  ).toBeVisible();
  await vi.waitFor(() => expect(github.account).toHaveBeenCalled());
  expect(
    within(card('Issues')).getByText(/Connect a GitHub account/),
  ).toBeVisible();
  expect(
    within(card('Build')).getByText(/Connect a GitHub account/),
  ).toBeVisible();
  expect(github.counts).not.toHaveBeenCalled();
  expect(github.headChecks).not.toHaveBeenCalled();
  expect(github.repository).not.toHaveBeenCalled();
  // Progress still counts tasks, and says why the mapped issues are not in it.
  expect(
    await within(card('Project progress')).findByText(
      /1 of 2 tasks · issues not counted: connect a GitHub account/,
    ),
  ).toBeVisible();
  expect(github.areaIssues).not.toHaveBeenCalled();
});

test('a folder that is not a repository says so and asks GitHub nothing about it', async () => {
  vi.mocked(git.detect).mockResolvedValue({ status: 'none' });
  vi.mocked(github.link).mockResolvedValue({ status: 'noRepository' });
  vi.mocked(projects.detect).mockResolvedValue({ status: 'none' });
  useWorkspace.setState({ workspace });
  render(<Dashboard onNavigate={vi.fn()} />);

  expect(
    await within(card('Git state')).findByText(
      'This folder is not a Git repository.',
    ),
  ).toBeVisible();
  expect(
    within(card('Commands')).getByText(/Not a TBCE project/),
  ).toBeVisible();
  await vi.waitFor(() => expect(github.account).toHaveBeenCalled());
  expect(git.status).not.toHaveBeenCalled();
  expect(github.counts).not.toHaveBeenCalled();
});

test('a commit GitHub does not have reads as not pushed rather than as failing', async () => {
  vi.mocked(github.headChecks).mockResolvedValue({
    oid: '0123456789abcdef0123456789abcdef01234567',
    checks: checks({
      summary: 'none',
      entries: [],
      missing: true,
      error: 'GitHub could not find the commit to read its checks.',
    }),
    rate: null,
  });

  await show();

  const build = card('Build');
  expect(within(build).getByRole('status')).toHaveTextContent(
    'This commit is not on GitHub yet',
  );
  expect(within(build).queryByRole('alert')).toBeNull();
});

test('issues turned off and a refused count are explained in their own cards', async () => {
  vi.mocked(github.counts).mockResolvedValue({
    openPullRequests: 1,
    openIssues: null,
    issuesDisabled: true,
    rate: null,
  });
  vi.mocked(github.milestones).mockRejectedValue({
    code: 'GITHUB_FORBIDDEN',
    message: 'refused',
  });

  await show();

  expect(within(card('Issues')).getByText(/turned off/)).toBeVisible();
  expect(within(card('Pull requests')).getByText('1')).toBeVisible();
  expect(
    within(card('Milestones')).getByText('This token cannot read milestones.'),
  ).toBeVisible();
});

test('the links open the panels beside the dashboard', async () => {
  const onNavigate = await show();

  fireEvent.click(screen.getByRole('button', { name: 'View issues' }));
  fireEvent.click(screen.getByRole('button', { name: 'View pull requests' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open source control' }),
  );

  expect(onNavigate.mock.calls).toEqual([
    ['github', 'issues'],
    ['github', 'pulls'],
    ['git'],
  ]);
});
