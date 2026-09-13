import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useWorkspace } from '../src/stores/workspace';
import { fileSystem } from '../src/services/filesystem';
import { ask } from '../src/stores/dialog';
import { isDirty, type FileDocument } from '../src/types/workspace';
vi.mock('../src/services/filesystem', () => ({
  fileSystem: {
    chooseWorkspace: vi.fn(),
    chooseFile: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    trash: vi.fn(),
  },
}));
vi.mock('../src/stores/dialog', () => ({ ask: vi.fn() }));
const doc = (path: string, content = 'original'): FileDocument => ({
  path,
  content,
  revision: 'r1',
  bom: false,
});
beforeEach(() => {
  vi.resetAllMocks();
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      workspace: { id: '1', name: 'test', path: 'C:/test' },
    },
    true,
  );
  vi.mocked(fileSystem.read).mockImplementation(async (_id, path) => doc(path));
  vi.mocked(fileSystem.list).mockResolvedValue([]);
  vi.mocked(fileSystem.write).mockImplementation(async (_id, document) => ({
    ...document,
    revision: 'r2',
  }));
});
async function edit(path = 'a.ts') {
  await actions.openFile(path);
  actions.edit(useWorkspace.getState().activeId!, 'edited');
}
test('opening a file twice activates its existing tab and retains edits', async () => {
  await edit();
  await actions.openFile('b.ts');
  await actions.openFile('A.ts');
  expect(useWorkspace.getState().tabs).toHaveLength(2);
  expect(useWorkspace.getState().tabs[0].content).toBe('edited');
  expect(useWorkspace.getState().activeId).toBe(
    useWorkspace.getState().tabs[0].id,
  );
  expect(fileSystem.read).toHaveBeenCalledTimes(2);
});
test('undoing to saved content clears the dirty flag', async () => {
  await edit();
  actions.edit(useWorkspace.getState().activeId!, 'original');
  expect(isDirty(useWorkspace.getState().tabs[0])).toBe(false);
});
test('Save All saves each dirty tab and updates revisions', async () => {
  await edit();
  await edit('b.ts');
  await actions.saveAll();
  expect(fileSystem.write).toHaveBeenCalledTimes(2);
  expect(
    useWorkspace
      .getState()
      .tabs.every((t) => !isDirty(t) && t.revision === 'r2'),
  ).toBe(true);
});
test('failed saves preserve dirty buffers and block tab closing', async () => {
  await edit();
  vi.mocked(fileSystem.write).mockRejectedValue({
    code: 'IO_ERROR',
    message: 'Disk full',
  });
  vi.mocked(ask).mockResolvedValue('save');
  await actions.close(useWorkspace.getState().activeId!);
  expect(useWorkspace.getState().tabs).toHaveLength(1);
  expect(isDirty(useWorkspace.getState().tabs[0])).toBe(true);
  expect(useWorkspace.getState().error).toBe('Disk full');
});
test('cancelled close retains the tab, discard closes it', async () => {
  await edit();
  vi.mocked(ask)
    .mockResolvedValueOnce('cancel')
    .mockResolvedValueOnce('discard');
  await actions.close(useWorkspace.getState().activeId!);
  expect(useWorkspace.getState().tabs).toHaveLength(1);
  await actions.close(useWorkspace.getState().activeId!);
  expect(useWorkspace.getState().tabs).toHaveLength(0);
  expect(fileSystem.write).not.toHaveBeenCalled();
});
test('cancelling a workspace picker retains edits previously marked for discard', async () => {
  await edit();
  vi.mocked(ask).mockResolvedValue('discard');
  vi.mocked(fileSystem.chooseWorkspace).mockResolvedValue(null);
  await actions.openWorkspace();
  expect(useWorkspace.getState().tabs[0].content).toBe('edited');
});
test('cancelled conflict does not overwrite or close the file', async () => {
  await edit();
  vi.mocked(fileSystem.write).mockRejectedValue({ code: 'CONFLICT' });
  vi.mocked(ask).mockResolvedValueOnce('save').mockResolvedValueOnce('cancel');
  await actions.close(useWorkspace.getState().activeId!);
  expect(useWorkspace.getState().tabs[0].external).toBe('changed');
  expect(isDirty(useWorkspace.getState().tabs[0])).toBe(true);
});
test('explicit overwrite uses a fresh disk revision', async () => {
  await edit();
  vi.mocked(fileSystem.write).mockRejectedValueOnce({ code: 'CONFLICT' });
  vi.mocked(fileSystem.read).mockResolvedValue({
    ...doc('a.ts', 'external'),
    revision: 'external-revision',
  });
  vi.mocked(ask).mockResolvedValue('overwrite');
  await actions.save();
  expect(fileSystem.write).toHaveBeenLastCalledWith(
    '1',
    expect.objectContaining({
      revision: 'external-revision',
      content: 'edited',
    }),
  );
  expect(isDirty(useWorkspace.getState().tabs[0])).toBe(false);
});
test('refresh reloads clean files but preserves dirty files and flags missing ones', async () => {
  await edit();
  await actions.openFile('b.ts');
  await actions.openFile('c.ts');
  vi.mocked(fileSystem.read).mockImplementation(async (_id, path) => {
    if (path === 'c.ts') throw { code: 'NOT_FOUND' };
    return { ...doc(path, 'external'), revision: 'r3' };
  });
  await actions.refresh();
  const tabs = useWorkspace.getState().tabs;
  expect(tabs[0].content).toBe('edited');
  expect(tabs[0].external).toBe('changed');
  expect(tabs[1].content).toBe('external');
  expect(isDirty(tabs[1])).toBe(false);
  expect(tabs[2].external).toBe('missing');
});
test('folder rename remaps open descendants and keeps buffer identity', async () => {
  await edit('src/a.ts');
  const id = useWorkspace.getState().activeId;
  actions.select({ name: 'src', path: 'src', kind: 'directory' });
  vi.mocked(ask).mockResolvedValue('lib');
  await actions.rename();
  expect(useWorkspace.getState().tabs[0]).toMatchObject({
    id,
    path: 'lib/a.ts',
    content: 'edited',
  });
});
test('cancelled native trash retains dirty tabs; confirmed trash removes descendants only', async () => {
  await edit('src/a.ts');
  await actions.openFile('src-other.ts');
  actions.select({ name: 'src', path: 'src', kind: 'directory' });
  vi.mocked(ask).mockResolvedValue('discard');
  vi.mocked(fileSystem.trash)
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  await actions.trash();
  expect(useWorkspace.getState().tabs).toHaveLength(2);
  await actions.trash();
  expect(useWorkspace.getState().tabs.map((t) => t.path)).toEqual([
    'src-other.ts',
  ]);
});
test('workspace changes and saves cannot overlap', async () => {
  await edit();
  let finish!: (document: FileDocument) => void;
  vi.mocked(fileSystem.write).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const saving = actions.save();
  await actions.openWorkspace();
  expect(fileSystem.chooseWorkspace).not.toHaveBeenCalled();
  finish(doc('a.ts', 'edited'));
  await saving;
  expect(useWorkspace.getState().busy).toBe(false);
});
