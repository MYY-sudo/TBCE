import { create } from 'zustand';
import { architectures } from '../services/architecture';
import type { Architecture, ArchitectureFields } from '../types/architecture';
interface State {
  architectures: Architecture[];
  warnings: string[];
  busy: boolean;
  loaded: boolean;
  error: string | null;
}
export const useArchitectures = create<State>(() => ({
  architectures: [],
  warnings: [],
  busy: false,
  loaded: false,
  error: null,
}));
const set = useArchitectures.setState;
const get = useArchitectures.getState;
async function perform(operation: () => Promise<boolean>) {
  if (get().busy) return false;
  set({ busy: true, error: null });
  try {
    return await operation();
  } catch (e) {
    set({ error: (e as { message?: string })?.message || String(e) });
    return false;
  } finally {
    set({ busy: false });
  }
}
export const architectureActions = {
  load: () =>
    perform(async () => {
      set({ ...(await architectures.list()), loaded: true });
      return true;
    }),
  save: (id: string | null, fields: ArchitectureFields) =>
    perform(async () => {
      const value = await architectures.save(id, fields);
      set({
        architectures: [
          ...get().architectures.filter((a) => a.id !== value.id),
          value,
        ].sort((a, b) => a.name.localeCompare(b.name)),
      });
      return true;
    }),
  delete: (id: string) =>
    perform(async () => {
      if (!(await architectures.delete(id))) return false;
      set({ architectures: get().architectures.filter((a) => a.id !== id) });
      return true;
    }),
  dismissError: () => set({ error: null }),
};
