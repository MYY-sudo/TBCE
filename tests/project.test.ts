import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useProject } from '../src/stores/project';
import { useWorkspace } from '../src/stores/workspace';
import { projects } from '../src/services/project';
import { fileSystem } from '../src/services/filesystem';
import { ask } from '../src/stores/dialog';
import type { Project, ProjectManifest } from '../src/types/project';
vi.mock('../src/services/project', () => ({
  projects: {
    detect: vi.fn(),
    init: vi.fn(),
    update: vi.fn(),
    createFolder: vi.fn(),
    openRecent: vi.fn(),
  },
}));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: { list: vi.fn(), chooseWorkspace: vi.fn() },
}));
vi.mock('../src/stores/dialog', () => ({ ask: vi.fn() }));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const manifest = (name: string): ProjectManifest => ({
  schemaVersion: 1,
  name,
  stack: 'rust-tauri',
  architecture: null,
  defaultBranch: 'main',
  commands: {},
});
const project = (name: string): Project => ({
  manifest: manifest(name),
  path: 'C:/code/app',
  hasGit: false,
});
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  useProject.setState({ ...useProject.getInitialState(), recent: [] }, true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  vi.mocked(projects.detect).mockResolvedValue({ status: 'none' });
});
test('creating a project names the folder, opens it, and writes a manifest', async () => {
  vi.mocked(ask).mockResolvedValue('My app');
  vi.mocked(projects.createFolder).mockResolvedValue(workspace);
  vi.mocked(projects.init).mockResolvedValue(project('My app'));
  await actions.createProject();
  expect(projects.createFolder).toHaveBeenCalledWith('My app');
  expect(projects.init).toHaveBeenCalledWith(
    '1',
    expect.objectContaining({ name: 'My app', commands: {} }),
  );
  expect(useWorkspace.getState().workspace).toEqual(workspace);
  expect(useProject.getState().detection).toMatchObject({
    status: 'found',
    manifest: { name: 'My app' },
  });
  expect(useProject.getState().recent[0]).toMatchObject({
    path: 'C:/code/app',
    name: 'My app',
    isProject: true,
  });
});
test('cancelling the location picker creates no project', async () => {
  vi.mocked(ask).mockResolvedValue('My app');
  vi.mocked(projects.createFolder).mockResolvedValue(null);
  await actions.createProject();
  expect(projects.init).not.toHaveBeenCalled();
  expect(useWorkspace.getState().workspace).toBeNull();
  expect(useProject.getState().recent).toHaveLength(0);
});
test('opening a workspace detects its project and records it as recent', async () => {
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'found',
    manifest: manifest('Detected'),
    path: 'C:/code/app',
    hasGit: true,
  });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useProject.getState().detection.status).toBe('found'),
  );
  expect(projects.detect).toHaveBeenCalledWith('1');
  expect(useProject.getState().project).toMatchObject({ hasGit: true });
  expect(useProject.getState().recent[0]).toMatchObject({
    name: 'Detected',
    isProject: true,
    stack: 'rust-tauri',
  });
});
test('a folder without a manifest is recorded but not treated as a project', async () => {
  useWorkspace.setState({ workspace });
  await actions.detect(workspace);
  expect(useProject.getState().project).toBeNull();
  expect(useProject.getState().recent[0]).toMatchObject({
    name: 'app',
    isProject: false,
  });
});
test('an unreadable manifest is reported without failing detection', async () => {
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'invalid',
    message: 'This project.json could not be read.',
  });
  useWorkspace.setState({ workspace });
  await actions.detect(workspace);
  expect(useProject.getState().detection.status).toBe('invalid');
  expect(useProject.getState().error).toBeNull();
});
test('a recent project that no longer opens is reported and forgotten', async () => {
  useWorkspace.setState({ workspace });
  await actions.detect(workspace);
  vi.mocked(projects.openRecent).mockRejectedValue({
    code: 'NOT_FOUND',
    message: 'The system cannot find the path specified.',
  });
  await actions.openRecent('C:/code/app');
  expect(useProject.getState().recent).toHaveLength(0);
  expect(useProject.getState().error).toContain('cannot find the path');
});
test('reopening a recent project restores the workspace and its manifest', async () => {
  vi.mocked(projects.openRecent).mockResolvedValue(workspace);
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'found',
    manifest: manifest('Reopened'),
    path: 'C:/code/app',
    hasGit: false,
  });
  await actions.openRecent('C:/code/app');
  expect(useWorkspace.getState().workspace).toEqual(workspace);
  expect(useProject.getState().detection).toMatchObject({
    manifest: { name: 'Reopened' },
  });
});
test('settings convert a plain folder and then update the existing manifest', async () => {
  useWorkspace.setState({ workspace });
  await vi.waitFor(() => expect(useProject.getState().busy).toBe(false));
  vi.mocked(projects.init).mockResolvedValue(project('Converted'));
  vi.mocked(projects.update).mockResolvedValue(project('Renamed'));
  const fields = {
    name: 'Converted',
    stack: null,
    architecture: null,
    defaultBranch: null,
    commands: {},
  };
  await actions.saveFields(fields);
  expect(projects.init).toHaveBeenCalledWith('1', fields);
  await actions.saveFields({ ...fields, name: 'Renamed' });
  expect(projects.update).toHaveBeenCalledWith('1', {
    ...fields,
    name: 'Renamed',
  });
});
test('recent projects persist, deduplicate by path, and stay capped', async () => {
  useWorkspace.setState({ workspace });
  for (let i = 0; i < 12; i++)
    await actions.detect({ ...workspace, name: `app-${i}`, path: `C:/w/${i}` });
  await actions.detect({ ...workspace, name: 'again', path: 'C:/w/11' });
  const recent = useProject.getState().recent;
  expect(recent).toHaveLength(10);
  expect(recent[0]).toMatchObject({ name: 'again', path: 'C:/w/11' });
  expect(recent.filter((r) => r.path === 'C:/w/11')).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem('tbce.recentProjects')!)).toHaveLength(
    10,
  );
});
test('closing the workspace clears the detected project', async () => {
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'found',
    manifest: manifest('Detected'),
    path: 'C:/code/app',
    hasGit: false,
  });
  useWorkspace.setState({ workspace });
  await vi.waitFor(() =>
    expect(useProject.getState().detection.status).toBe('found'),
  );
  useWorkspace.setState({ workspace: null });
  expect(useProject.getState().project).toBeNull();
  expect(useProject.getState().detection.status).toBe('none');
});

test('latest workspace detection wins even when an earlier request is still pending', async () => {
  let finish!: (value: Awaited<ReturnType<typeof projects.detect>>) => void;
  vi.mocked(projects.detect).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  useWorkspace.setState({ workspace });
  const other = { id: '2', name: 'B', path: 'C:/B' };
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'found',
    ...project('B'),
  });
  useWorkspace.setState({ workspace: other });
  expect(useProject.getState().project).toBeNull();
  await vi.waitFor(() =>
    expect(useProject.getState().project?.manifest.name).toBe('B'),
  );
  finish({ status: 'found', ...project('A') });
  await Promise.resolve();
  expect(useProject.getState().project?.manifest.name).toBe('B');
  expect(useProject.getState().recent.map((r) => r.name)).toEqual(['B']);
});

test('closing a workspace ignores pending detection and its errors', async () => {
  let reject!: (error: unknown) => void;
  vi.mocked(projects.detect).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  useWorkspace.setState({ workspace });
  useWorkspace.setState({ workspace: null });
  reject({ message: 'Old folder failed' });
  await Promise.resolve();
  expect(useProject.getState()).toMatchObject({
    project: null,
    detection: { status: 'none' },
    busy: false,
    error: null,
  });
});

test('a save completing after a workspace switch cannot replace the current project', async () => {
  useWorkspace.setState({ workspace });
  await vi.waitFor(() => expect(useProject.getState().busy).toBe(false));
  let finish!: (value: Project) => void;
  vi.mocked(projects.init).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const saving = actions.saveFields({ name: 'Old', commands: {} });
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'found',
    ...project('New'),
  });
  useWorkspace.setState({
    workspace: { id: '2', name: 'New', path: 'C:/new' },
  });
  await vi.waitFor(() =>
    expect(useProject.getState().project?.manifest.name).toBe('New'),
  );
  finish(project('Old'));
  expect(await saving).toBe(false);
  expect(useProject.getState().project?.manifest.name).toBe('New');
});
