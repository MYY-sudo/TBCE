import { create } from 'zustand';
import { git } from '../services/git';
import { useWorkspace } from './workspace';
import type { GitDetection } from '../types/git';
import type { ServiceError, Workspace } from '../types/workspace';
interface GitState {
  detection: GitDetection;
  busy: boolean;
  error: string | null;
}
const initial: GitState = {
  detection: { status: 'none' },
  busy: false,
  error: null,
};
export const useGit = create<GitState>(() => ({ ...initial }));
const set = useGit.setState;
// Detection is slow enough to outlive the workspace it was asked about, so each request is
// numbered and a late answer for a replaced workspace is discarded rather than displayed.
let request = 0;
const isCurrent = (id: string | undefined) =>
  useWorkspace.getState().workspace?.id === id;
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
  dismissError: () => set({ error: null }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id === previous.workspace?.id) return;
  request++;
  set({ ...initial });
  if (state.workspace) void actions.detect(state.workspace);
});
