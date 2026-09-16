export interface ArchitectureFields {
  name: string;
  description: string;
  boundaries: string;
  directories: string[];
  files: { path: string; content: string }[];
}
export interface Architecture extends ArchitectureFields {
  schemaVersion: number;
  id: string;
}
export interface ArchitectureCatalog {
  architectures: Architecture[];
  warnings: string[];
}
export interface StructureEntry {
  path: string;
  directory: boolean;
}
export interface StructurePreview {
  entries: StructureEntry[];
  conflicts: string[];
}
