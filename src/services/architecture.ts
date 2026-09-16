import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  Architecture,
  ArchitectureFields,
  ArchitectureCatalog,
  StructurePreview,
} from '../types/architecture';
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message: 'Open the TBCE desktop app to use saved architectures.',
    });
  return invoke<T>(command, args);
}
export const architectures = {
  list: () => call<ArchitectureCatalog>('list_architectures'),
  get: (id: string) => call<Architecture>('get_architecture', { id }),
  save: (id: string | null, fields: ArchitectureFields) =>
    call<Architecture>('save_architecture', { id, fields }),
  delete: (id: string) => call<boolean>('delete_architecture', { id }),
  preview: (stackId: string | null, architectureId: string | null) =>
    call<StructurePreview>('preview_project_structure', {
      stackId,
      architectureId,
    }),
};
