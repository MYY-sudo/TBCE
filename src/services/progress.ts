import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  Progress,
  ProgressDetection,
  ProgressPlan,
} from '../types/progress';
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message:
        'Open the TBCE desktop app to track progress. Use npm run tauri dev during development.',
    });
  return invoke<T>(command, args);
}
export const progress = {
  read: (workspaceId: string) =>
    call<ProgressDetection>('read_progress', { workspaceId }),
  /// `revision` is the one that was read, or null when there was no file. A plan changed on disk
  /// since then is refused with CONFLICT rather than overwritten.
  write: (workspaceId: string, plan: ProgressPlan, revision: string | null) =>
    call<Progress>('write_progress', { workspaceId, plan, revision }),
};
