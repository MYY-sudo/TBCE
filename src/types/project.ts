export interface ProjectCommands {
  install?: string | null;
  dev?: string | null;
  build?: string | null;
  test?: string | null;
}
export interface ProjectManifest {
  schemaVersion: number;
  name: string;
  stack?: string | null;
  architecture?: string | null;
  defaultBranch?: string | null;
  commands: ProjectCommands;
}
export interface ProjectFields {
  name: string;
  stack?: string | null;
  architecture?: string | null;
  defaultBranch?: string | null;
  commands: ProjectCommands;
}
export interface Project {
  manifest: ProjectManifest;
  path: string;
}
export type ProjectDetection =
  | { status: 'none' }
  | {
      status: 'found';
      manifest: ProjectManifest;
      path: string;
    }
  | { status: 'invalid'; message: string };
export interface RecentProject {
  path: string;
  name: string;
  isProject: boolean;
  stack?: string | null;
  lastOpened: number;
}
export const emptyFields = (name: string): ProjectFields => ({
  name,
  stack: null,
  architecture: null,
  defaultBranch: null,
  commands: {},
});
export const fieldsOf = (manifest: ProjectManifest): ProjectFields => ({
  name: manifest.name,
  stack: manifest.stack ?? null,
  architecture: manifest.architecture ?? null,
  defaultBranch: manifest.defaultBranch ?? null,
  commands: { ...manifest.commands },
});
