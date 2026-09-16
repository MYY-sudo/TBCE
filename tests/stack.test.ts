import { beforeEach, expect, test, vi } from 'vitest';
import { stackActions, useStacks } from '../src/stores/stack';
import {
  actions as workspaceActions,
  useWorkspace,
} from '../src/stores/workspace';
import { useProject } from '../src/stores/project';
import { templates } from '../src/services/templates';
import { projects } from '../src/services/project';
import { fileSystem } from '../src/services/filesystem';
import { ask } from '../src/stores/dialog';
import type { Stack } from '../src/types/stack';

vi.mock('../src/services/templates', () => ({
  templates: {
    list: vi.fn(),
    save: vi.fn(),
    edit: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: {
    list: vi.fn(),
    chooseWorkspace: vi.fn(),
    write: vi.fn(),
    read: vi.fn(),
  },
}));
vi.mock('../src/services/project', () => ({ projects: { detect: vi.fn() } }));
vi.mock('../src/stores/dialog', () => ({ ask: vi.fn() }));
const workspace = { id: '1', name: 'Old', path: 'C:/Old' };
const destination = { id: '2', name: 'New', path: 'C:/New' };
const stack: Stack = {
  schemaVersion: 1,
  id: 'stack-1',
  snapshot: 'snapshot-1',
  name: 'Starter',
  description: '',
  languages: [],
  frameworks: [],
  defaults: { name: 'Old', commands: { dev: 'npm run dev' } },
  entries: [],
};
beforeEach(async () => {
  vi.resetAllMocks();
  useStacks.setState(useStacks.getInitialState(), true);
  vi.mocked(projects.detect).mockResolvedValue({ status: 'none' });
  useWorkspace.setState({ ...useWorkspace.getInitialState(), workspace }, true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  vi.mocked(templates.list).mockResolvedValue({
    stacks: [stack],
    warnings: [],
  });
  await vi.waitFor(() => expect(useProject.getState().busy).toBe(false));
});
test('loads persisted stacks and exposes catalog warnings', async () => {
  vi.mocked(templates.list).mockResolvedValue({
    stacks: [stack],
    warnings: ['Skipped damaged stack'],
  });
  await stackActions.load();
  expect(useStacks.getState().stacks).toEqual([stack]);
  expect(useStacks.getState().warnings).toEqual(['Skipped damaged stack']);
});
test('creation adopts the workspace and records its detected project', async () => {
  vi.mocked(templates.create).mockResolvedValue(destination);
  vi.mocked(projects.detect).mockResolvedValue({
    status: 'found',
    manifest: {
      schemaVersion: 1,
      name: 'New',
      stack: stack.id,
      commands: stack.defaults.commands,
    },
    path: destination.path,
  });
  expect(
    await stackActions.create(stack.id, {
      name: 'New',
      commands: stack.defaults.commands,
    }),
  ).toBe(true);
  expect(templates.create).toHaveBeenCalledWith(
    '1',
    stack.id,
    expect.objectContaining({ name: 'New' }),
    null,
  );
  expect(useWorkspace.getState().workspace).toEqual(destination);
  await vi.waitFor(() =>
    expect(useProject.getState().recent[0]).toMatchObject({
      name: 'New',
      stack: stack.id,
      isProject: true,
    }),
  );
});
test('cancelled and failed creation preserve dirty buffers and the old workspace', async () => {
  const tab = {
    id: 'tab-1',
    path: 'a.ts',
    content: 'edited',
    savedContent: 'old',
    revision: 'rev',
    bom: false,
    external: null,
  };
  useWorkspace.setState({ tabs: [tab], activeId: tab.id });
  vi.mocked(ask).mockResolvedValue('discard');
  vi.mocked(templates.create).mockResolvedValue(null);
  expect(await stackActions.create(null, { name: 'New', commands: {} })).toBe(
    false,
  );
  vi.mocked(templates.create).mockRejectedValue({ message: 'Disk full' });
  expect(await stackActions.create(null, { name: 'New', commands: {} })).toBe(
    false,
  );
  expect(useWorkspace.getState().workspace).toEqual(workspace);
  expect(useWorkspace.getState().tabs).toEqual([tab]);
  expect(useStacks.getState().error).toBe('Disk full');
});
test('creation serializes workspace operations and ignores a duplicate submit', async () => {
  let finish!: (value: typeof destination) => void;
  vi.mocked(templates.create).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const creating = stackActions.create(stack.id, { name: 'New', commands: {} });
  await vi.waitFor(() => expect(templates.create).toHaveBeenCalled());
  expect(await workspaceActions.openWorkspace()).toBe(false);
  expect(
    await stackActions.create(null, { name: 'Duplicate', commands: {} }),
  ).toBe(false);
  expect(fileSystem.chooseWorkspace).not.toHaveBeenCalled();
  finish(destination);
  await creating;
  expect(templates.create).toHaveBeenCalledTimes(1);
});
test('replacement cancellation and failure keep the old library entry', async () => {
  await stackActions.load();
  vi.mocked(templates.save).mockResolvedValue(null);
  expect(await stackActions.save('1', stack.id, stack, [])).toBe(false);
  vi.mocked(templates.save).mockRejectedValue({ message: 'Source changed' });
  expect(await stackActions.save('1', stack.id, stack, [])).toBe(false);
  expect(useStacks.getState().stacks).toEqual([stack]);
  expect(useStacks.getState().error).toBe('Source changed');
});
test('a stale capture cannot save from a different workspace', async () => {
  expect(await stackActions.save('old-workspace', null, stack, [])).toBe(false);
  expect(templates.save).not.toHaveBeenCalled();
  expect(useStacks.getState().error).toContain('workspace changed');
});
test('successful save, metadata edit and confirmed deletion update the library', async () => {
  vi.mocked(templates.save).mockResolvedValue(stack);
  expect(await stackActions.save('1', null, stack, [])).toBe(true);
  vi.mocked(templates.edit).mockResolvedValue({ ...stack, name: 'Edited' });
  await stackActions.edit(stack.id, { ...stack, name: 'Edited' });
  expect(useStacks.getState().stacks[0].name).toBe('Edited');
  vi.mocked(templates.delete)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  await stackActions.delete(stack.id);
  expect(useStacks.getState().stacks).toHaveLength(1);
  await stackActions.delete(stack.id);
  expect(useStacks.getState().stacks).toHaveLength(0);
});
