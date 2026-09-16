export type GitHead =
  | { kind: 'unborn'; branch: string }
  | { kind: 'branch'; name: string; oid: string }
  | { kind: 'detached'; oid: string };
export interface GitRepository {
  root: string;
  gitDir: string;
  commonDir: string;
  linkedWorktree: boolean;
  bare: boolean;
  head: GitHead;
}
export type GitDetection =
  | { status: 'none' }
  | { status: 'found'; repository: GitRepository }
  | { status: 'parent'; root: string }
  | { status: 'unavailable'; code: string; message: string };
export type GitChangeState =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'typeChanged';
export interface GitChange {
  path: string;
  originalPath: string | null;
  state: GitChangeState;
}
export interface GitConflict {
  path: string;
  state: string;
}
export interface GitStatus {
  repository: GitRepository;
  branch: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  staged: GitChange[];
  unstaged: GitChange[];
  untracked: string[];
  conflicts: GitConflict[];
}
export interface GitBranch {
  name: string;
  oid: string;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  gone: boolean;
  current: boolean;
  worktree: string | null;
  remote: boolean;
}
export interface GitBranches {
  current: string | null;
  detached: boolean;
  defaultBranch: string | null;
  local: GitBranch[];
  remote: GitBranch[];
}
export interface GitCommit {
  oid: string;
  shortOid: string;
  parents: string[];
  author: string;
  email: string;
  authoredAt: string;
  committedAt: string;
  summary: string;
  refs: string[];
}
export interface GitHistory {
  commits: GitCommit[];
  skip: number;
  hasMore: boolean;
}
export interface GitDiffStat {
  path: string;
  originalPath: string | null;
  added: number | null;
  removed: number | null;
  binary: boolean;
}
export interface GitFileDiff {
  path: string;
  originalPath: string | null;
  staged: boolean;
  binary: boolean;
  truncated: boolean;
  added: number | null;
  removed: number | null;
  patch: string;
}
export interface GitCloneOutcome {
  path: string;
  name: string;
  defaultBranch: string | null;
}
/// The label the explorer shows for a repository, given its HEAD.
export const headLabel = (head: GitHead): string =>
  head.kind === 'branch'
    ? head.name
    : head.kind === 'unborn'
      ? `${head.branch} (no commits yet)`
      : `detached at ${head.oid.slice(0, 7)}`;
