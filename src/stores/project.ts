import { create } from 'zustand';
import { projects } from '../services/project';
import { actions as workspaceActions, useWorkspace } from './workspace';
import { ask } from './dialog';
import { emptyFields, type ProjectDetection } from '../types/project';
import type { Project, ProjectFields, RecentProject } from '../types/project';
import type { ServiceError, Workspace } from '../types/workspace';
const KEY = 'tbce.recentProjects';
const LIMIT = 10;
interface ProjectState {
  detection: ProjectDetection;
  project: Project | null;
  recent: RecentProject[];
  busy: boolean;
  error: string | null;
}
const initial: ProjectState = {
  detection: { status: 'none' },
  project: null,
  recent: [],
  busy: false,
  error: null,
};
function stored(): RecentProject[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is RecentProject =>
          typeof entry?.path === 'string' && typeof entry?.name === 'string',
      )
      .slice(0, LIMIT);
  } catch {
    // Recent projects are a convenience; unreadable storage must not block the editor.
    return [];
  }
}
export const useProject = create<ProjectState>(() => ({
  ...initial,
  recent: stored(),
}));
const get = useProject.getState;
const set = useProject.setState;
let detectionRequest = 0;
let detecting = false;
let mutating = false;
const isCurrent = (id: string | undefined) =>
  useWorkspace.getState().workspace?.id === id;
const updateBusy = () => set({ busy: detecting || mutating });
function save(recent: RecentProject[]) {
  set({ recent });
  try {
    localStorage.setItem(KEY, JSON.stringify(recent));
  } catch {
    // Ignore quota or privacy-mode failures; the list stays for this session only.
  }
}
function remember(entry: RecentProject) {
  save(
    [
      entry,
      ...get().recent.filter(
        (r) => r.path.toLowerCase() !== entry.path.toLowerCase(),
      ),
    ].slice(0, LIMIT),
  );
}
function forget(path: string) {
  save(get().recent.filter((r) => r.path.toLowerCase() !== path.toLowerCase()));
}
async function perform(
  action: (context: { workspaceId: string | undefined }) => Promise<void>,
): Promise<boolean> {
  if (get().busy) return false;
  const context = { workspaceId: useWorkspace.getState().workspace?.id };
  mutating = true;
  set({ busy: true, error: null });
  try {
    await action(context);
    return isCurrent(context.workspaceId);
  } catch (error) {
    if (isCurrent(context.workspaceId))
      set({ error: (error as ServiceError)?.message || String(error) });
    return false;
  } finally {
    mutating = false;
    updateBusy();
  }
}
function adopt(project: Project, workspace: Workspace) {
  if (!isCurrent(workspace.id)) return;
  detectionRequest++;
  detecting = false;
  set({
    error: null,
    project,
    detection: {
      status: 'found',
      manifest: project.manifest,
      path: project.path,
      hasGit: project.hasGit,
    },
  });
  updateBusy();
  remember({
    // The workspace path is the spelling the user picked, and the one reopening expects.
    path: workspace.path,
    name: project.manifest.name,
    isProject: true,
    stack: project.manifest.stack ?? null,
    lastOpened: Date.now(),
  });
}
async function detect(workspace: Workspace, request: number) {
  const detection = await projects.detect(workspace.id);
  if (request !== detectionRequest || !isCurrent(workspace.id)) return;
  set({
    detection,
    project:
      detection.status === 'found'
        ? {
            manifest: detection.manifest,
            path: detection.path,
            hasGit: detection.hasGit,
          }
        : null,
  });
  remember({
    path: workspace.path,
    name:
      detection.status === 'found' ? detection.manifest.name : workspace.name,
    isProject: detection.status === 'found',
    stack:
      detection.status === 'found' ? (detection.manifest.stack ?? null) : null,
    lastOpened: Date.now(),
  });
}
export const actions = {
  detect: async (workspace: Workspace) => {
    if (!isCurrent(workspace.id)) return;
    const request = ++detectionRequest;
    detecting = true;
    set({ detection: { status: 'none' }, project: null, error: null });
    updateBusy();
    try {
      await detect(workspace, request);
    } catch (error) {
      if (request === detectionRequest && isCurrent(workspace.id))
        set({ error: (error as ServiceError)?.message || String(error) });
    } finally {
      if (request === detectionRequest) {
        detecting = false;
        updateBusy();
      }
    }
  },
  createProject: () =>
    perform(async (context) => {
      if (!(await workspaceActions.canCloseWindow())) return;
      const name = await ask({
        title: 'New project',
        message: 'Name the project, then choose where to create its folder.',
        input: '',
        actions: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Choose location', value: 'submit' },
        ],
      });
      if (!name) return;
      const workspace = await projects.createFolder(name);
      if (!workspace) return;
      context.workspaceId = workspace.id;
      await workspaceActions.setWorkspace(workspace, 'Project created');
      if (!isCurrent(workspace.id)) return;
      adopt(await projects.init(workspace.id, emptyFields(name)), workspace);
    }),
  openRecent: (path: string) =>
    perform(async (context) => {
      if (!(await workspaceActions.canCloseWindow())) return;
      let workspace;
      try {
        workspace = await projects.openRecent(path);
      } catch (error) {
        if ((error as ServiceError)?.code !== 'DESKTOP_REQUIRED') forget(path);
        throw error;
      }
      context.workspaceId = workspace.id;
      await workspaceActions.setWorkspace(workspace, 'Project opened');
      await actions.detect(workspace);
    }),
  forgetRecent: (path: string) => forget(path),
  saveFields: (fields: ProjectFields) =>
    perform(async () => {
      const workspace = useWorkspace.getState().workspace;
      if (!workspace) return;
      // Anything other than "none" means the file exists, including a manifest TBCE could not read.
      const project =
        get().detection.status === 'none'
          ? await projects.init(workspace.id, fields)
          : await projects.update(workspace.id, fields);
      adopt(project, workspace);
    }),
  dismissError: () => set({ error: null }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id === previous.workspace?.id) return;
  detectionRequest++;
  detecting = false;
  set({ detection: { status: 'none' }, project: null, error: null });
  updateBusy();
  if (state.workspace) void actions.detect(state.workspace);
});
