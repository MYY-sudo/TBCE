import { create } from 'zustand';
import { fileSystem } from '../services/filesystem';
import { ask } from './dialog';
import {
  fileName,
  isDirty,
  isWithin,
  parentPath,
  type EditorTab,
  type FileEntry,
  type ServiceError,
  type Workspace,
} from '../types/workspace';
interface WorkspaceState {
  workspace: Workspace | null;
  tabs: EditorTab[];
  activeId: string | null;
  tree: Record<string, FileEntry[]>;
  expanded: string[];
  selected: FileEntry | null;
  busy: boolean;
  error: string | null;
  status: string;
  cursor: { line: number; column: number };
}
const initial: WorkspaceState = {
  workspace: null,
  tabs: [],
  activeId: null,
  tree: {},
  expanded: [''],
  selected: null,
  busy: false,
  error: null,
  status: 'Ready',
  cursor: { line: 1, column: 1 },
};
export const useWorkspace = create<WorkspaceState>(() => ({ ...initial }));
const get = useWorkspace.getState;
const set = useWorkspace.setState;
let nextTab = 0;
function report(error: unknown) {
  set({
    error: (error as ServiceError)?.message || String(error),
    status: 'Action failed',
  });
}
async function perform(action: () => Promise<void>): Promise<boolean> {
  if (get().busy) return false;
  set({ busy: true, error: null });
  try {
    await action();
    return true;
  } catch (error) {
    report(error);
    return false;
  } finally {
    set({ busy: false });
  }
}
function updateTab(id: string, changes: Partial<EditorTab>) {
  set({
    tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...changes } : t)),
  });
}
async function loadDirectory(path: string) {
  const workspace = get().workspace;
  if (!workspace) return;
  const entries = await fileSystem.list(workspace.id, path);
  set({ tree: { ...get().tree, [path]: entries } });
}
async function refreshTree() {
  const tree: Record<string, FileEntry[]> = {};
  for (const path of get().expanded) {
    try {
      tree[path] = await fileSystem.list(get().workspace!.id, path);
    } catch (error) {
      if (path === '' || (error as ServiceError).code !== 'NOT_FOUND')
        throw error;
    }
  }
  set({ tree, expanded: get().expanded.filter((path) => path in tree) });
}
async function adopt(workspace: Workspace, status: string) {
  set({ ...initial, workspace, busy: true, status });
  await loadDirectory('');
}
async function openPath(path: string) {
  const existing = get().tabs.find(
    (t) => t.path.toLowerCase() === path.toLowerCase(),
  );
  if (existing) {
    set({ activeId: existing.id });
    return;
  }
  const document = await fileSystem.read(get().workspace!.id, path);
  const tab: EditorTab = {
    ...document,
    id: `tab-${++nextTab}`,
    savedContent: document.content,
    external: null,
  };
  set({
    tabs: [...get().tabs, tab],
    activeId: tab.id,
    status: `Opened ${fileName(path)}`,
  });
}
async function saveTab(id: string): Promise<boolean> {
  const tab = get().tabs.find((t) => t.id === id);
  if (!tab || !isDirty(tab)) return true;
  let document;
  try {
    document = await fileSystem.write(get().workspace!.id, tab);
  } catch (error) {
    if ((error as ServiceError).code !== 'CONFLICT') throw error;
    updateTab(id, { external: 'changed' });
    const choice = await ask({
      title: 'File changed on disk',
      message: `${tab.path} has a newer version on disk. Reload discards your edits; overwrite replaces that version.`,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Reload from disk', value: 'reload' },
        { label: 'Overwrite', value: 'overwrite', danger: true },
      ],
    });
    if (!choice || choice === 'cancel') return false;
    const latest = await fileSystem.read(get().workspace!.id, tab.path);
    if (choice === 'reload') {
      updateTab(id, {
        ...latest,
        savedContent: latest.content,
        external: null,
      });
      return true;
    }
    document = await fileSystem.write(get().workspace!.id, {
      ...tab,
      revision: latest.revision,
    });
  }
  updateTab(id, {
    revision: document.revision,
    savedContent: document.content,
    external: null,
  });
  set({ status: `Saved ${fileName(tab.path)}` });
  return true;
}
async function confirmDirty(tabs: EditorTab[]) {
  for (const tab of tabs.filter(isDirty)) {
    const choice = await ask({
      title: 'Save your changes?',
      message: `${tab.path} has unsaved changes.`,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Discard', value: 'discard', danger: true },
        { label: 'Save', value: 'save' },
      ],
    });
    if (!choice || choice === 'cancel') return false;
    if (choice === 'save' && !(await saveTab(tab.id))) return false;
  }
  return true;
}
async function checkExternal() {
  for (const tab of get().tabs) {
    try {
      const disk = await fileSystem.read(get().workspace!.id, tab.path);
      if (disk.revision !== tab.revision) {
        if (isDirty(tab)) updateTab(tab.id, { external: 'changed' });
        else
          updateTab(tab.id, {
            ...disk,
            savedContent: disk.content,
            external: null,
          });
      } else updateTab(tab.id, { external: null });
    } catch (error) {
      if ((error as ServiceError).code === 'NOT_FOUND')
        updateTab(tab.id, { external: 'missing' });
      else throw error;
    }
  }
}
export const actions = {
  openWorkspace: () =>
    perform(async () => {
      if (!(await confirmDirty(get().tabs))) return;
      const workspace = await fileSystem.chooseWorkspace();
      if (workspace) await adopt(workspace, 'Workspace opened');
    }),
  setWorkspace: (workspace: Workspace, status: string) =>
    perform(() => adopt(workspace, status)),
  openFile: (path?: string) =>
    perform(async () => {
      if (!get().workspace) return;
      const chosen = path ?? (await fileSystem.chooseFile(get().workspace!.id));
      if (chosen) await openPath(chosen);
    }),
  toggleDirectory: (path: string) =>
    perform(async () => {
      if (get().expanded.includes(path))
        set({ expanded: get().expanded.filter((p) => p !== path) });
      else {
        await loadDirectory(path);
        set({ expanded: [...get().expanded, path] });
      }
    }),
  select: (selected: FileEntry | null) => set({ selected }),
  activate: (activeId: string) => {
    if (!get().busy) set({ activeId });
  },
  edit: (id: string, content: string) => updateTab(id, { content }),
  save: () =>
    perform(async () => {
      if (get().activeId) await saveTab(get().activeId!);
    }),
  saveAll: () =>
    perform(async () => {
      for (const tab of get().tabs) {
        if (!(await saveTab(tab.id))) break;
      }
    }),
  close: (id: string) =>
    perform(async () => {
      const tab = get().tabs.find((t) => t.id === id);
      if (!tab || !(await confirmDirty([tab]))) return;
      const index = get().tabs.findIndex((t) => t.id === id);
      const tabs = get().tabs.filter((t) => t.id !== id);
      set({
        tabs,
        activeId:
          get().activeId === id
            ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? null)
            : get().activeId,
      });
    }),
  canCloseWindow: async () => {
    let approved = false;
    await perform(async () => {
      approved = await confirmDirty(get().tabs);
    });
    return approved;
  },
  refresh: () =>
    perform(async () => {
      if (get().workspace) {
        await refreshTree();
        await checkExternal();
        set({ status: 'Workspace refreshed' });
      }
    }),
  checkExternal: () =>
    perform(async () => {
      if (get().workspace) await checkExternal();
    }),
  create: (directory: boolean) =>
    perform(async () => {
      if (!get().workspace) return;
      const selected = get().selected;
      const parent =
        selected?.kind === 'directory'
          ? selected.path
          : parentPath(selected?.path ?? '');
      const name = await ask({
        title: directory ? 'New folder' : 'New file',
        message: `Create in ${parent || get().workspace!.name}`,
        input: '',
        actions: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Create', value: 'submit' },
        ],
      });
      if (!name) return;
      if (name.includes('/') || name.includes('\\'))
        throw new Error('Enter a name, not a path.');
      const path = parent ? `${parent}/${name}` : name;
      await fileSystem.create(get().workspace!.id, path, directory);
      set({ expanded: [...new Set([...get().expanded, parent])] });
      set({ selected: { name, path, kind: directory ? 'directory' : 'file' } });
      await refreshTree();
      if (!directory) await openPath(path);
      set({ status: `Created ${name}` });
    }),
  rename: () =>
    perform(async () => {
      const entry = get().selected;
      if (!entry) return;
      const name = await ask({
        title: 'Rename',
        message: entry.path,
        input: entry.name,
        actions: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Rename', value: 'submit' },
        ],
      });
      if (!name || name === entry.name) return;
      if (name.includes('/') || name.includes('\\'))
        throw new Error('Enter a name, not a path.');
      const parent = parentPath(entry.path);
      const to = parent ? `${parent}/${name}` : name;
      await fileSystem.rename(get().workspace!.id, entry.path, to);
      const remap = (path: string) =>
        isWithin(path, entry.path) ? to + path.slice(entry.path.length) : path;
      set({
        tabs: get().tabs.map((t) => ({ ...t, path: remap(t.path) })),
        expanded: get().expanded.map(remap),
        selected: { ...entry, name, path: to },
      });
      await refreshTree();
      set({ status: `Renamed to ${name}` });
    }),
  trash: () =>
    perform(async () => {
      const entry = get().selected;
      if (
        !entry ||
        !(await confirmDirty(
          get().tabs.filter((t) => isWithin(t.path, entry.path)),
        ))
      )
        return;
      if (!(await fileSystem.trash(get().workspace!.id, entry.path))) return;
      const tabs = get().tabs.filter((t) => !isWithin(t.path, entry.path));
      set({
        tabs,
        activeId: tabs.some((t) => t.id === get().activeId)
          ? get().activeId
          : (tabs.at(-1)?.id ?? null),
        selected: null,
        expanded: get().expanded.filter((p) => !isWithin(p, entry.path)),
      });
      await refreshTree();
      set({ status: `Moved ${entry.name} to Recycle Bin` });
    }),
  reload: () =>
    perform(async () => {
      const tab = get().tabs.find((t) => t.id === get().activeId);
      if (!tab) return;
      if (isDirty(tab)) {
        const choice = await ask({
          title: 'Reload from disk?',
          message: 'Your unsaved edits will be discarded.',
          actions: [
            { label: 'Cancel', value: 'cancel' },
            { label: 'Reload', value: 'reload', danger: true },
          ],
        });
        if (choice !== 'reload') return;
      }
      const disk = await fileSystem.read(get().workspace!.id, tab.path);
      updateTab(tab.id, {
        ...disk,
        savedContent: disk.content,
        external: null,
      });
    }),
  dismissError: () => set({ error: null }),
};
