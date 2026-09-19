import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ProgressCard } from '../src/dashboard/ProgressCard';
import { useDashboard } from '../src/stores/dashboard';
import { useGitHub } from '../src/stores/github';
import { useProject } from '../src/stores/project';
import { useProgress } from '../src/stores/progress';
import { useWorkspace } from '../src/stores/workspace';
import { progress } from '../src/services/progress';
import { github } from '../src/services/github';
import { fileSystem } from '../src/services/filesystem';
import type { ProgressPlan } from '../src/types/progress';
vi.mock('../src/services/progress', () => ({
  progress: { read: vi.fn(), write: vi.fn() },
}));
vi.mock('../src/services/github', () => ({
  github: { areaIssues: vi.fn(), issueChoices: vi.fn(), account: vi.fn() },
}));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: { list: vi.fn(), chooseWorkspace: vi.fn() },
}));
vi.mock('../src/services/project', () => ({
  projects: { detect: vi.fn().mockResolvedValue({ status: 'none' }) },
}));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const project = {
  path: 'C:/code/app',
  manifest: {
    schemaVersion: 1,
    name: 'App',
    stack: null,
    architecture: null,
    defaultBranch: null,
    commands: {},
  },
};
const plan: ProgressPlan = {
  areas: [
    {
      id: 'a1',
      name: '<b>Auth</b>',
      label: null,
      milestone: null,
      tasks: [
        { id: 't1', title: '<img src=x onerror="alert(1)">', done: false },
        { id: 't2', title: 'Register', done: true },
      ],
    },
    { id: 'a2', name: 'Teams', label: null, milestone: null, tasks: [] },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  useDashboard.setState(useDashboard.getInitialState(), true);
  useGitHub.setState(useGitHub.getInitialState(), true);
  useProgress.setState(useProgress.getInitialState(), true);
  useProject.setState({ ...useProject.getInitialState(), recent: [] }, true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  useWorkspace.setState({ workspace });
  useProject.setState({
    project,
    detection: {
      status: 'found',
      manifest: project.manifest,
      path: project.path,
    },
  });
  vi.mocked(progress.read).mockResolvedValue({
    status: 'found',
    plan,
    revision: 'r1',
  });
  vi.mocked(progress.write).mockImplementation(async (_, sent) => ({
    plan: sent,
    revision: 'r2',
  }));
});
const signedOut = 'connect a GitHub account';

test('a plain folder is asked to become a project before progress is kept', () => {
  useProject.setState({ project: null, detection: { status: 'none' } });

  render(<ProgressCard unavailable={signedOut} />);

  expect(screen.getByText(/Convert this folder/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Convert to project' }),
  ).toBeVisible();
  expect(progress.read).not.toHaveBeenCalled();
});

test('a project with no plan offers to add areas', async () => {
  vi.mocked(progress.read).mockResolvedValue({ status: 'none' });

  render(<ProgressCard unavailable={signedOut} />);

  expect(await screen.findByText(/No areas yet/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Add areas' }));
  // An empty plan opens with one blank area to fill in.
  expect(screen.getByRole('textbox', { name: 'Area name' })).toHaveValue('');
});

test('a file TBCE cannot use is reported and cannot be edited here', async () => {
  vi.mocked(progress.read).mockResolvedValue({
    status: 'invalid',
    message: 'progress.json uses schema version 2.',
  });

  render(<ProgressCard unavailable={signedOut} />);

  expect(await screen.findByText(/schema version 2/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Edit areas' })).toBeNull();
});

test('areas show their figures, open onto their tasks, and render names as text', async () => {
  render(<ProgressCard unavailable={signedOut} />);

  expect(
    await screen.findByRole('progressbar', { name: '<b>Auth</b> progress' }),
  ).toHaveAttribute('aria-valuenow', '50');
  expect(screen.getByText('nothing to measure')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '<b>Auth</b>' }));

  expect(
    screen.getByRole('checkbox', { name: '<img src=x onerror="alert(1)">' }),
  ).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Register' })).toBeChecked();
  expect(document.querySelector('.progress-areas img')).toBeNull();
  expect(document.querySelector('.progress-areas b')).toBeNull();
});

test('ticking a task saves it at once', async () => {
  render(<ProgressCard unavailable={signedOut} />);
  fireEvent.click(await screen.findByRole('button', { name: '<b>Auth</b>' }));

  fireEvent.click(
    screen.getByRole('checkbox', { name: '<img src=x onerror="alert(1)">' }),
  );

  await vi.waitFor(() => expect(progress.write).toHaveBeenCalledTimes(1));
  const [id, sent, revision] = vi.mocked(progress.write).mock.calls[0];
  expect(id).toBe('1');
  expect(revision).toBe('r1');
  expect(sent.areas[0].tasks[0].done).toBe(true);
  expect(
    await screen.findByRole('progressbar', { name: '<b>Auth</b> progress' }),
  ).toHaveAttribute('aria-valuenow', '100');
});

test('the dialog adds, reorders and removes areas and tasks, then saves once', async () => {
  render(<ProgressCard unavailable={signedOut} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit areas' }));
  const dialog = screen.getByRole('dialog');

  fireEvent.click(within(dialog).getByRole('button', { name: /Add area/ }));
  const names = within(dialog).getAllByRole('textbox', { name: 'Area name' });
  fireEvent.change(names[2], { target: { value: 'Permissions' } });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Add task to Permissions' }),
  );
  const titles = within(dialog).getAllByRole('textbox', { name: 'Task title' });
  fireEvent.change(titles[titles.length - 1], { target: { value: ' Roles ' } });
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Move Permissions up' }),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove Teams' }));
  fireEvent.change(
    within(dialog).getAllByRole('combobox', { name: 'GitHub label' })[1],
    { target: { value: 'area:permissions' } },
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await vi.waitFor(() => expect(progress.write).toHaveBeenCalledTimes(1));
  const sent = vi.mocked(progress.write).mock.calls[0][1];
  expect(sent.areas.map((area) => area.name)).toEqual([
    '<b>Auth</b>',
    'Permissions',
  ]);
  expect(sent.areas[1]).toMatchObject({
    label: 'area:permissions',
    milestone: null,
    tasks: [{ title: 'Roles', done: false }],
  });
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('the dialog says what is wrong before anything is sent', async () => {
  render(<ProgressCard unavailable={signedOut} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit areas' }));
  const dialog = screen.getByRole('dialog');

  fireEvent.change(
    within(dialog).getAllByRole('textbox', { name: 'Area name' })[1],
    { target: { value: '<B>AUTH</B>' } },
  );

  expect(within(dialog).getByRole('alert')).toHaveTextContent(/two areas/);
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(
    within(dialog).getAllByRole('combobox', { name: 'GitHub label' })[0],
    { target: { value: 'a,b' } },
  );
  fireEvent.change(
    within(dialog).getAllByRole('textbox', { name: 'Area name' })[1],
    { target: { value: 'Teams' } },
  );
  expect(within(dialog).getByRole('alert')).toHaveTextContent(/no commas/);
  expect(progress.write).not.toHaveBeenCalled();
});

test('a mapped area signed out counts its tasks and says why issues are missing', async () => {
  vi.mocked(progress.read).mockResolvedValue({
    status: 'found',
    revision: 'r1',
    plan: {
      areas: [{ ...plan.areas[0], name: 'Auth', label: 'area:auth' }],
    },
  });

  render(<ProgressCard unavailable={signedOut} />);

  expect(
    await screen.findByText(
      '1 of 2 tasks · issues not counted: connect a GitHub account',
    ),
  ).toBeVisible();
  expect(
    screen.getByText(/whose issues could not be read count their tasks/),
  ).toBeVisible();
  expect(github.areaIssues).not.toHaveBeenCalled();
});
