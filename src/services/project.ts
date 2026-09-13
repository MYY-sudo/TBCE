import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  Project,
  ProjectDetection,
  ProjectFields,
} from '../types/project';
import type { Workspace } from '../types/workspace';
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message:
        'Open the TBCE desktop app to work with projects. Use npm run tauri dev during development.',
    });
  return invoke<T>(command, args);
}
export const projects = {
  detect: (workspaceId: string) =>
    call<ProjectDetection>('detect_project', { workspaceId }),
  init: (workspaceId: string, fields: ProjectFields) =>
    call<Project>('init_project', { workspaceId, fields }),
  update: (workspaceId: string, fields: ProjectFields) =>
    call<Project>('update_project', { workspaceId, fields }),
  openRecent: (path: string) =>
    call<Workspace>('open_recent_project', { path }),
};
