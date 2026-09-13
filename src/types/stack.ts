import type { ProjectFields } from './project';

export interface StackFields {
  name: string;
  description: string;
  languages: string[];
  frameworks: string[];
  defaults: ProjectFields;
}
export interface SourceEntry {
  path: string;
  directory: boolean;
  size: number;
  revision: string;
  selected: boolean;
  blocked: string | null;
}
export interface Stack extends StackFields {
  schemaVersion: number;
  id: string;
  snapshot: string;
  entries: SourceEntry[];
}
export interface StackCatalog {
  stacks: Stack[];
  warnings: string[];
}
