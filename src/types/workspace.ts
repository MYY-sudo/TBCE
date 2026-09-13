export interface Workspace {
  id: string;
  name: string;
  path: string;
}
export interface FileEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory' | 'blocked';
}
export interface FileDocument {
  path: string;
  content: string;
  revision: string;
  bom: boolean;
}
export interface EditorTab extends FileDocument {
  id: string;
  savedContent: string;
  external: 'changed' | 'missing' | null;
}
export interface ServiceError {
  code: string;
  message: string;
}
export const isDirty = (tab: EditorTab) => tab.content !== tab.savedContent;
export const isWithin = (path: string, parent: string) =>
  path === parent || path.startsWith(`${parent}/`);
export const fileName = (path: string) => path.split('/').pop() ?? path;
export const parentPath = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
