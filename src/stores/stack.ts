import { create } from 'zustand';
import { templates } from '../services/templates';
import { actions as workspaceActions, useWorkspace } from './workspace';
import type { Stack, StackFields, SourceEntry } from '../types/stack';
import type { ProjectFields } from '../types/project';

interface StackState {
  stacks: Stack[];
  warnings: string[];
  busy: boolean;
  error: string | null;
}
export const useStacks = create<StackState>(() => ({
  stacks: [],
  warnings: [],
  busy: false,
  error: null,
}));
const set = useStacks.setState;
const get = useStacks.getState;
const message = (e: unknown) =>
  (e as { message?: string })?.message || String(e);
async function perform(operation: () => Promise<boolean>): Promise<boolean> {
  if (get().busy) return false;
  set({ busy: true, error: null });
  try {
    return await operation();
  } catch (error) {
    set({ error: message(error) });
    return false;
  } finally {
    set({ busy: false });
  }
}
function adopt(stack: Stack) {
  set({
    stacks: [...get().stacks.filter((s) => s.id !== stack.id), stack].sort(
      (a, b) => a.name.localeCompare(b.name),
    ),
  });
}
export const stackActions = {
  load: () =>
    perform(async () => {
      set(await templates.list());
      return true;
    }),
  save: (
    workspaceId: string,
    id: string | null,
    fields: StackFields,
    entries: SourceEntry[],
  ) =>
    perform(async () => {
      let saved = false;
      await workspaceActions.withWorkspace(workspaceId, async () => {
        const stack = await templates.save(workspaceId, id, fields, entries);
        if (stack) {
          adopt(stack);
          saved = true;
        }
      });
      if (!saved && useWorkspace.getState().error)
        set({ error: useWorkspace.getState().error });
      return saved;
    }),
  edit: (id: string, fields: StackFields) =>
    perform(async () => {
      adopt(await templates.edit(id, fields));
      return true;
    }),
  delete: (id: string) =>
    perform(async () => {
      if (!(await templates.delete(id))) return false;
      set({ stacks: get().stacks.filter((s) => s.id !== id) });
      return true;
    }),
  create: (stackId: string | null, fields: ProjectFields) =>
    perform(async () => {
      const created = await workspaceActions.replaceWorkspace((id) =>
        templates.create(id, stackId, fields),
      );
      if (!created && useWorkspace.getState().error)
        set({ error: useWorkspace.getState().error });
      return created;
    }),
  dismissError: () => set({ error: null }),
};
