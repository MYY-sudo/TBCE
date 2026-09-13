import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  Stack,
  StackCatalog,
  StackFields,
  SourceEntry,
} from '../types/stack';
import type { ProjectFields } from '../types/project';
import type { Workspace } from '../types/workspace';

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message: 'Open the TBCE desktop app to use saved stacks.',
    });
  return invoke<T>(command, args);
}
export const templates = {
  list: () => call<StackCatalog>('list_stacks'),
  inspect: (workspaceId: string, path: string) =>
    call<SourceEntry[]>('inspect_stack_source', { workspaceId, path }),
  save: (
    workspaceId: string,
    id: string | null,
    fields: StackFields,
    entries: SourceEntry[],
  ) => call<Stack | null>('save_stack', { workspaceId, id, fields, entries }),
  edit: (id: string, fields: StackFields) =>
    call<Stack>('edit_stack', { id, fields }),
  delete: (id: string) => call<boolean>('delete_stack', { id }),
  create: (
    workspaceId: string | null,
    stackId: string | null,
    fields: ProjectFields,
  ) =>
    call<Workspace | null>('create_project_from_stack', {
      workspaceId,
      stackId,
      fields,
    }),
};
