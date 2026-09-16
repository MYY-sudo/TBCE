import { create } from 'zustand';
import { git } from '../services/git';
import { useWorkspace } from './workspace';
import type {
  GitBranches,
  GitCommit,
  GitDetection,
  GitDiffStat,
  GitFileDiff,
  GitStatus,
} from '../types/git';
import type { ServiceError, Workspace } from '../types/workspace';
/// One page of commit history. The backend bounds a page itself; this is what the panel asks for.
export const PAGE = 30;
/// Index and worktree diffs are separate answers, so one path can carry two different counts.
export const statKey = (path: string, staged: boolean) =>
  `${staged ? 'index' : 'worktree'}:${path}`;
interface GitState {
  detection: GitDetection;
  status: GitStatus | null;
  branches: GitBranches | null;
  history: GitCommit[];
  hasMore: boolean;
  summary: Record<string, GitDiffStat>;
  selected: { path: string; staged: boolean } | null;
  diff: GitFileDiff | null;
  message: string;
  busy: boolean;
  error: string | null;
  notice: string | null;
}
const initial: GitState = {
  detection: { status: 'none' },
  status: null,
  branches: null,
  history: [],
  hasMore: false,
  summary: {},
  selected: null,
  diff: null,
  message: '',
  busy: false,
  error: null,
  notice: null,
};
export const useGit = create<GitState>(() => ({ ...initial }));
const set = useGit.setState;
const get = useGit.getState;
// Git work is slow enough to outlive the workspace it was asked about, so each request is numbered
// and a late answer for a replaced workspace is discarded rather than displayed. The same flag
// serializes the panel: a second operation started while one runs is refused rather than queued,
// because the backend serializes repository access anyway and a queue would only hide the wait.
let request = 0;
const isCurrent = (id: string | undefined) =>
  useWorkspace.getState().workspace?.id === id;
const workspaceId = () => useWorkspace.getState().workspace?.id;
async function run(
  id: string,
  work: () => Promise<Partial<GitState> | null>,
): Promise<boolean> {
  if (get().busy || !isCurrent(id)) return false;
  const current = ++request;
  set({ busy: true, error: null, notice: null });
  try {
    const changes = await work();
    if (current !== request || !isCurrent(id)) return false;
    if (changes) set(changes);
    return true;
  } catch (error) {
    if (current !== request || !isCurrent(id)) return false;
    set({ error: (error as ServiceError)?.message || String(error) });
    return false;
  } finally {
    if (current === request) set({ busy: false });
  }
}
const perform = (work: (id: string) => Promise<Partial<GitState> | null>) => {
  const id = workspaceId();
  return id ? run(id, () => work(id)) : Promise.resolve(false);
};
async function readSummary(id: string) {
  const summary: Record<string, GitDiffStat> = {};
  for (const staged of [false, true])
    for (const stat of await git.diffSummary(id, staged))
      summary[statKey(stat.path, staged)] = stat;
  return summary;
}
/// Rereads the open preview. A staged, checked-out or committed file may no longer differ, and
/// losing a preview that has nothing left to show is a normal outcome rather than a failure.
async function readDiff(
  id: string,
  selection: { path: string; staged: boolean } | null,
): Promise<Partial<GitState>> {
  if (!selection) return { selected: null, diff: null };
  try {
    return {
      selected: selection,
      diff: await git.diff(id, selection.path, selection.staged),
    };
  } catch {
    return { selected: null, diff: null };
  }
}
async function reload(id: string): Promise<Partial<GitState>> {
  const status = await git.status(id);
  const branches = await git.branches(id);
  const page = await git.history(id, 0, PAGE);
  const summary = await readSummary(id);
  return {
    status,
    branches,
    history: page.commits,
    hasMore: page.hasMore,
    summary,
    ...(await readDiff(id, get().selected)),
  };
}
/// Staging moves content between the index and the working tree. It cannot change which branches
/// exist or what has been committed, so branches and history are left as they are.
const afterStaging = async (
  id: string,
  status: GitStatus,
): Promise<Partial<GitState>> => ({
  status,
  summary: await readSummary(id),
  ...(await readDiff(id, get().selected)),
});
export const actions = {
  detect: async (workspace: Workspace) => {
    if (!isCurrent(workspace.id)) return;
    const current = ++request;
    set({ busy: true, error: null });
    try {
      const detection = await git.detect(workspace.id);
      if (current !== request || !isCurrent(workspace.id)) return;
      set({ detection });
    } catch (error) {
      if (current !== request || !isCurrent(workspace.id)) return;
      // A workspace with no Git at all is a normal state, not an error to report.
      set({
        detection: { status: 'none' },
        error: (error as ServiceError)?.message || String(error),
      });
    } finally {
      if (current === request) set({ busy: false });
    }
  },
  refresh: () => perform(reload),
  more: () =>
    perform(async (id) => {
      const page = await git.history(id, get().history.length, PAGE);
      return {
        history: [...get().history, ...page.commits],
        hasMore: page.hasMore,
      };
    }),
  select: (path: string, staged: boolean) =>
    perform(async (id) => ({
      selected: { path, staged },
      diff: await git.diff(id, path, staged),
    })),
  closeDiff: () => set({ selected: null, diff: null }),
  setMessage: (message: string) => set({ message }),
  stage: (paths: string[]) =>
    perform(async (id) => afterStaging(id, await git.stage(id, paths))),
  stageAll: () =>
    perform(async (id) => afterStaging(id, await git.stageAll(id))),
  unstage: (paths: string[]) =>
    perform(async (id) => afterStaging(id, await git.unstage(id, paths))),
  commit: () =>
    perform(async (id) => {
      await git.commit(id, get().message);
      return { ...(await reload(id)), message: '' };
    }),
  createBranch: (name: string) =>
    perform(async (id) => ({ branches: await git.createBranch(id, name) })),
  checkout: (name: string) =>
    perform(async (id) => {
      await git.checkoutBranch(id, name);
      return reload(id);
    }),
  // The backend asks for native confirmation. A cancelled deletion answers false and changes nothing.
  deleteBranch: (name: string) =>
    perform(async (id) =>
      (await git.deleteBranch(id, name))
        ? { branches: await git.branches(id) }
        : null,
    ),
  fetch: () =>
    perform(async (id) => {
      await git.fetch(id);
      return reload(id);
    }),
  pull: () =>
    perform(async (id) => {
      await git.pull(id);
      return reload(id);
    }),
  // A branch with no upstream has nothing to push to, so the first push publishes it.
  push: () =>
    perform(async (id) => {
      await git.push(id, get().status?.upstream === null);
      return reload(id);
    }),
  init: (defaultBranch: string | null) =>
    perform(async (id) => {
      const repository = await git.init(id, defaultBranch);
      return {
        detection: { status: 'found' as const, repository },
        ...(await reload(id)),
      };
    }),
  // Cloning never switches workspaces, so its only result is a location to report.
  clone: (source: string, folder: string) =>
    perform(async (id) => {
      const outcome = await git.clone(id, source, folder);
      return outcome
        ? {
            notice: `Cloned into ${outcome.path}. Open that folder to work in it.`,
          }
        : null;
    }),
  dismissError: () => set({ error: null }),
  dismissNotice: () => set({ notice: null }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id === previous.workspace?.id) return;
  request++;
  set({ ...initial });
  if (state.workspace) void actions.detect(state.workspace);
});
