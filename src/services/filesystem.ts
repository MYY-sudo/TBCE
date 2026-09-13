import { invoke, isTauri } from '@tauri-apps/api/core';
import type { FileDocument, FileEntry, Workspace } from '../types/workspace';
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message:
        'Open the TBCE desktop app to work with local files. Use npm run tauri dev during development.',
    });
  return invoke<T>(command, args);
}
export const fileSystem = {
  chooseWorkspace: () => call<Workspace | null>('choose_workspace'),
  chooseFile: (workspaceId: string) =>
    call<string | null>('choose_file', { workspaceId }),
  list: (workspaceId: string, path: string) =>
    call<FileEntry[]>('list_directory', { workspaceId, path }),
  read: (workspaceId: string, path: string) =>
    call<FileDocument>('read_file', { workspaceId, path }),
  write: (workspaceId: string, document: FileDocument) =>
    call<FileDocument>('write_file', { workspaceId, ...document }),
  create: (workspaceId: string, path: string, directory: boolean) =>
    call<void>('create_entry', { workspaceId, path, directory }),
  rename: (workspaceId: string, from: string, to: string) =>
    call<void>('rename_entry', { workspaceId, from, to }),
  trash: (workspaceId: string, path: string) =>
    call<boolean>('trash_entry', { workspaceId, path }),
};
