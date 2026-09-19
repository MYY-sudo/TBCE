import { create } from 'zustand';
import { progress } from '../services/progress';
import { useWorkspace } from './workspace';
import type { ProgressDetection, ProgressPlan } from '../types/progress';
import type { ServiceError } from '../types/workspace';
interface ProgressState {
  detection: ProgressDetection;
  /// The file has been read for this folder at least once.
  loaded: boolean;
  busy: boolean;
  error: string | null;
}
const initial: ProgressState = {
  detection: { status: 'none' },
  loaded: false,
  busy: false,
  error: null,
};
export const useProgress = create<ProgressState>(() => ({ ...initial }));
const set = useProgress.setState;
const get = useProgress.getState;
// Reads and writes are numbered, so an answer for a folder that has since been replaced is dropped.
// A write also outdates any read already under way, which could otherwise bring back the plan it
// replaced.
let reads = 0;
let writes = 0;
const isCurrent = (id: string | undefined) =>
  useWorkspace.getState().workspace?.id === id;
const failed = (error: unknown) =>
  (error as ServiceError)?.message || String(error);
const CHANGED =
  'progress.json changed on disk since TBCE read it, so this change was not saved. The plan on disk is shown now.';
export const actions = {
  /// Reads `.tbce/progress.json`. Nothing else reads it, and nothing reads commits.
  load: async (): Promise<boolean> => {
    const id = useWorkspace.getState().workspace?.id;
    if (!id) return false;
    const current = ++reads;
    try {
      const detection = await progress.read(id);
      if (current !== reads || !isCurrent(id)) return false;
      set({ detection, loaded: true });
      return true;
    } catch (error) {
      if (current !== reads || !isCurrent(id)) return false;
      set({ error: failed(error), loaded: true });
      return false;
    }
  },
  /// Replaces the plan, naming the revision that was read. One write at a time.
  save: async (plan: ProgressPlan): Promise<boolean> => {
    const id = useWorkspace.getState().workspace?.id;
    const detection = get().detection;
    if (!id || get().busy || detection.status === 'invalid') return false;
    const revision = detection.status === 'found' ? detection.revision : null;
    const current = ++writes;
    reads++;
    set({ busy: true, error: null });
    try {
      const saved = await progress.write(id, plan, revision);
      if (current !== writes || !isCurrent(id)) return false;
      reads++;
      set({
        detection: {
          status: 'found',
          plan: saved.plan,
          revision: saved.revision,
        },
      });
      return true;
    } catch (error) {
      if (current !== writes || !isCurrent(id)) return false;
      const conflict = (error as ServiceError)?.code === 'CONFLICT';
      set({ error: conflict ? CHANGED : failed(error) });
      if (conflict) void actions.load();
      return false;
    } finally {
      if (current === writes) set({ busy: false });
    }
  },
  /// Ticks or unticks one task and saves at once.
  toggleTask: (areaId: string, taskId: string) => {
    const detection = get().detection;
    if (detection.status !== 'found') return Promise.resolve(false);
    return actions.save({
      areas: detection.plan.areas.map((area) =>
        area.id !== areaId
          ? area
          : {
              ...area,
              tasks: area.tasks.map((task) =>
                task.id === taskId ? { ...task, done: !task.done } : task,
              ),
            },
      ),
    });
  },
  dismissError: () => set({ error: null }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id === previous.workspace?.id) return;
  reads++;
  writes++;
  set({ ...initial });
});
