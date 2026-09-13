import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  NewProjectDialog,
  SaveStackDialog,
} from '../src/templates/StackDialogs';
import { StacksPanel } from '../src/templates/StacksPanel';
import { templates } from '../src/services/templates';
import { projects } from '../src/services/project';
import { useStacks } from '../src/stores/stack';
import { useWorkspace } from '../src/stores/workspace';
import { useProject } from '../src/stores/project';
import type { Stack, SourceEntry } from '../src/types/stack';

vi.mock('../src/services/templates', () => ({
  templates: {
    list: vi.fn(),
    inspect: vi.fn(),
    save: vi.fn(),
    edit: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../src/services/project', () => ({ projects: { detect: vi.fn() } }));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: { list: vi.fn() },
}));
const stack: Stack = {
  schemaVersion: 1,
  id: 'stack-1',
  snapshot: 'snapshot-1',
  name: 'Web starter',
  description: 'A saved web app',
  languages: ['typescript'],
  frameworks: ['react'],
  defaults: {
    name: 'Original',
    commands: { dev: 'npm run dev' },
    architecture: 'layered',
  },
  entries: [],
};
function entry(path: string, directory = false, selected = true): SourceEntry {
  return {
    path,
    directory,
    selected,
    size: directory ? 0 : 10,
    revision: directory ? '' : 'revision',
    blocked: null,
  };
}
beforeEach(async () => {
  vi.resetAllMocks();
  useStacks.setState(useStacks.getInitialState(), true);
  vi.mocked(projects.detect).mockResolvedValue({ status: 'none' });
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      workspace: { id: '1', name: 'Current', path: 'C:/Current' },
    },
    true,
  );
  vi.mocked(templates.list).mockResolvedValue({
    stacks: [stack],
    warnings: [],
  });
  vi.mocked(templates.inspect).mockImplementation(async (_id, path) => {
    if (path === '')
      return [
        entry('src', true),
        entry('node_modules', true, false),
        entry('.env', false, false),
        entry('.env.example'),
      ];
    if (path === 'src') return [entry('src/index.ts')];
    return [entry('node_modules/package.json', false, false)];
  });
  vi.mocked(templates.save).mockResolvedValue(stack);
  await vi.waitFor(() => expect(useProject.getState().busy).toBe(false));
});
test('new project uses selected defaults, accepts overrides, and preserves its name when switching stacks', async () => {
  vi.mocked(templates.create).mockResolvedValue(null);
  render(<NewProjectDialog onClose={vi.fn()} />);
  await screen.findByRole('option', { name: 'Web starter' });
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: 'My project' },
  });
  fireEvent.change(screen.getByLabelText('Stack'), {
    target: { value: stack.id },
  });
  expect(screen.getByLabelText('Dev')).toHaveValue('npm run dev');
  expect(screen.getByLabelText('Name')).toHaveValue('My project');
  fireEvent.change(screen.getByLabelText('Dev'), {
    target: { value: 'npm run start' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Choose location' }));
  await waitFor(() =>
    expect(templates.create).toHaveBeenCalledWith(
      '1',
      stack.id,
      expect.objectContaining({
        name: 'My project',
        commands: { dev: 'npm run start' },
      }),
    ),
  );
});
test('snapshot selection loads source directories and permits deliberate excluded-file inclusion', async () => {
  const close = vi.fn();
  render(<SaveStackDialog onClose={close} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save stack' })).toBeEnabled(),
  );
  expect(screen.getByLabelText('.env')).not.toBeChecked();
  expect(screen.getByLabelText('.env.example')).toBeChecked();
  expect(templates.inspect).not.toHaveBeenCalledWith('1', 'node_modules');
  fireEvent.click(screen.getByLabelText('.env'));
  fireEvent.click(screen.getByRole('button', { name: 'Expand src' }));
  expect(await screen.findByLabelText('index.ts')).toBeChecked();
  fireEvent.click(screen.getByLabelText('index.ts'));
  fireEvent.click(screen.getByRole('button', { name: 'Save stack' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  const entries = vi.mocked(templates.save).mock.calls[0][3];
  expect(entries.map((e) => e.path).sort()).toEqual([
    '.env',
    '.env.example',
    'src',
  ]);
});
test('selecting an excluded directory includes its descendants', async () => {
  render(<SaveStackDialog onClose={vi.fn()} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save stack' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByLabelText('node_modules/'));
  await waitFor(() =>
    expect(screen.getByLabelText('package.json')).toBeChecked(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save stack' }));
  await waitFor(() => expect(templates.save).toHaveBeenCalled());
  expect(
    vi.mocked(templates.save).mock.calls[0][3].map((e) => e.path),
  ).toContain('node_modules/package.json');
});
test('inspection failure blocks saving and refresh recovers', async () => {
  vi.mocked(templates.inspect).mockRejectedValueOnce({
    message: 'Cannot read src',
  });
  render(<SaveStackDialog onClose={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot read src');
  expect(screen.getByRole('button', { name: 'Save stack' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh file list' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save stack' })).toBeEnabled(),
  );
});
test('metadata editing leaves snapshot files untouched', async () => {
  vi.mocked(templates.edit).mockResolvedValue({ ...stack, name: 'Renamed' });
  const close = vi.fn();
  render(<SaveStackDialog stack={stack} editing onClose={close} />);
  fireEvent.change(screen.getByLabelText('Stack name'), {
    target: { value: 'Renamed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(templates.inspect).not.toHaveBeenCalled();
  expect(templates.save).not.toHaveBeenCalled();
  expect(templates.edit).toHaveBeenCalledWith(
    stack.id,
    expect.objectContaining({ name: 'Renamed' }),
  );
});
test('an empty library explains how to save the first stack', async () => {
  vi.mocked(templates.list).mockResolvedValue({ stacks: [], warnings: [] });
  render(<StacksPanel />);
  expect(
    await screen.findByRole('heading', { name: 'No saved stacks yet' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Save current project as stack' }),
  ).toBeEnabled();
});
