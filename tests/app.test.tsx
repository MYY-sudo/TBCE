import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/app/App';
import { useWorkspace } from '../src/stores/workspace';
import { useProject } from '../src/stores/project';
import { useGit } from '../src/stores/git';
import { useGitHub } from '../src/stores/github';
import { git } from '../src/services/git';
import { github } from '../src/services/github';
vi.mock('../src/editor/Editor', () => ({
  default: () => <div>Editor surface</div>,
}));
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
  },
}));
const repository = {
  root: 'C:/code/app',
  gitDir: 'C:/code/app/.git',
  commonDir: 'C:/code/app/.git',
  linkedWorktree: false,
  bare: false,
  head: { kind: 'branch' as const, name: 'main', oid: 'abc1234def' },
};
const status = {
  repository,
  branch: 'main',
  upstream: null,
  ahead: null,
  behind: null,
  staged: [],
  unstaged: [],
  untracked: [],
  conflicts: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useWorkspace.setState(useWorkspace.getInitialState());
  useProject.setState({ ...useProject.getInitialState(), recent: [] });
  useGit.setState(useGit.getInitialState(), true);
  useGitHub.setState(useGitHub.getInitialState(), true);
  vi.mocked(github.account).mockResolvedValue({ status: 'signedOut' });
  vi.mocked(github.link).mockResolvedValue({ status: 'noRepository' });
  vi.mocked(git.detect).mockResolvedValue({ status: 'found', repository });
  vi.mocked(git.status).mockResolvedValue(status);
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
});
test('renders the empty workspace and disabled save actions', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: 'A place for your project.' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
test('browser preview explains that native file access requires the desktop app', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open a folder' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('desktop app'),
  );
});
test('recent projects are listed and can be removed', () => {
  useProject.setState({
    recent: [
      {
        path: 'C:/code/app',
        name: 'App',
        isProject: true,
        stack: null,
        lastOpened: 1,
      },
    ],
  });
  render(<App />);
  expect(screen.getByTitle('C:/code/app')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove App from recent projects' }),
  );
  expect(useProject.getState().recent).toHaveLength(0);
  expect(screen.queryByTitle('C:/code/app')).not.toBeInTheDocument();
});
test('creating a project asks for a name before touching the filesystem', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'New project' }));
  const name = await screen.findByLabelText('Name');
  fireEvent.change(name, { target: { value: 'My app' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose location' }));
  expect(
    await screen.findByText(
      'Open the TBCE desktop app to use saved architectures.',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Choose location' }),
  ).toBeDisabled();
});

test('the activity bar opens the source control panel, which refreshes on focus', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Source control' }));
  expect(screen.getByText('SOURCE CONTROL')).toBeInTheDocument();
  // With no folder open the panel reads nothing at all.
  expect(git.status).not.toHaveBeenCalled();
  useWorkspace.setState({
    workspace: { id: '1', name: 'app', path: 'C:/code/app' },
  });
  await waitFor(() => expect(git.status).toHaveBeenCalledTimes(1));
  fireEvent.focus(window);
  await waitFor(() => expect(git.status).toHaveBeenCalledTimes(2));
});

test('the activity bar opens the GitHub panel, which reads nothing until connected', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));

  expect(screen.getByText('GITHUB')).toBeInTheDocument();
  expect(await screen.findByText('NOT CONNECTED')).toBeInTheDocument();
  await waitFor(() => expect(github.account).toHaveBeenCalled());
  // A panel with no account asks GitHub for nothing about any repository.
  expect(github.repository).not.toHaveBeenCalled();
  expect(github.commits).not.toHaveBeenCalled();
  // Nor does opening it start reading Git for the source control panel.
  expect(git.status).not.toHaveBeenCalled();
});

test('the GitHub panel is not read while another panel is showing', async () => {
  render(<App />);
  useWorkspace.setState({
    workspace: { id: '1', name: 'app', path: 'C:/code/app' },
  });

  await waitFor(() => expect(git.detect).toHaveBeenCalled());
  fireEvent.focus(window);

  // The workspace subscription reads the remote for the panel's label; nothing asks GitHub.
  expect(github.account).not.toHaveBeenCalled();
  expect(github.repository).not.toHaveBeenCalled();
});

test('the source control panel is not read while another panel is showing', async () => {
  render(<App />);
  useWorkspace.setState({
    workspace: { id: '1', name: 'app', path: 'C:/code/app' },
  });
  await waitFor(() => expect(git.detect).toHaveBeenCalled());
  fireEvent.focus(window);
  // Detection feeds the explorer's branch label; nothing else runs until the panel is open.
  await waitFor(() => expect(git.detect).toHaveBeenCalled());
  expect(git.status).not.toHaveBeenCalled();
});

test('opening a diff hides the editor instead of unmounting it', async () => {
  useWorkspace.setState({
    workspace: { id: '1', name: 'app', path: 'C:/code/app' },
    tabs: [
      {
        id: 'tab-1',
        path: 'src/app.ts',
        content: 'a',
        savedContent: 'a',
        revision: 'sha-1',
        bom: false,
        external: null,
      },
    ],
    activeId: 'tab-1',
  });
  render(<App />);
  // The editor is lazy, so it arrives a tick after the shell.
  expect(await screen.findByText('Editor surface')).toBeVisible();
  useGit.setState({ selected: { path: 'src/app.ts', staged: false } });
  // Unmounting the editor would dispose Monaco's models and cost every tab its undo history.
  await waitFor(() =>
    expect(screen.getByText('Editor surface')).not.toBeVisible(),
  );
  expect(screen.getByText('Editor surface')).toBeInTheDocument();
  useGit.setState({ selected: null });
  await waitFor(() => expect(screen.getByText('Editor surface')).toBeVisible());
});

test.each(['GitHub', 'Toggle explorer'])(
  'a GitHub panel collapsed with %s does not fetch on window focus',
  async (collapseButton) => {
    vi.mocked(github.account).mockResolvedValue({
      status: 'signedIn',
      login: 'test-user',
      name: null,
      scopes: [],
      rate: null,
    });
    vi.mocked(github.link).mockResolvedValue({
      status: 'found',
      remote: 'origin',
      owner: 'test-owner',
      repo: 'test-repo',
    });
    vi.mocked(github.repository).mockResolvedValue({
      owner: 'test-owner',
      name: 'test-repo',
      fullName: 'test-owner/test-repo',
      description: null,
      defaultBranch: 'main',
      private: false,
      fork: false,
      archived: false,
      stars: 0,
      forks: 0,
      watchers: 0,
      openIssuesAndPullRequests: 0,
      hasIssues: true,
      pushedAt: null,
      language: null,
      url: null,
      rate: null,
    });
    vi.mocked(github.branches).mockResolvedValue({
      items: [],
      page: 1,
      hasMore: false,
      rate: null,
    });
    vi.mocked(github.commits).mockResolvedValue({
      items: [],
      page: 1,
      hasMore: false,
      rate: null,
    });
    vi.mocked(github.activity).mockResolvedValue({
      items: [],
      page: 1,
      hasMore: false,
      rate: null,
    });
    useWorkspace.setState({
      workspace: { id: 'review-workspace', name: 'test', path: 'C:/test' },
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));
    await waitFor(() => expect(useGitHub.getState().repository).not.toBeNull());
    await waitFor(() => expect(useGitHub.getState().dataBusy).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: collapseButton }));
    expect(screen.queryByText('GITHUB')).toBeNull();
    vi.mocked(github.repository).mockClear();
    vi.mocked(github.link).mockClear();
    fireEvent.focus(window);
    await waitFor(() => expect(useGitHub.getState().dataBusy).toBe(false));
    expect(github.repository).not.toHaveBeenCalled();
  },
);
