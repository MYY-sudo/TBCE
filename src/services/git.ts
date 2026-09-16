import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  GitBranches,
  GitCloneOutcome,
  GitCommit,
  GitDetection,
  GitDiffStat,
  GitFileDiff,
  GitHistory,
  GitRepository,
  GitStatus,
} from '../types/git';
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message:
        'Open the TBCE desktop app to use Git. Use npm run tauri dev during development.',
    });
  return invoke<T>(command, args);
}
export const git = {
  detect: (workspaceId: string) =>
    call<GitDetection>('git_detect_repository', { workspaceId }),
  init: (workspaceId: string, defaultBranch: string | null) =>
    call<GitRepository>('git_init_repository', { workspaceId, defaultBranch }),
  status: (workspaceId: string) =>
    call<GitStatus>('git_status', { workspaceId }),
  branches: (workspaceId: string) =>
    call<GitBranches>('git_branches', { workspaceId }),
  stage: (workspaceId: string, paths: string[]) =>
    call<GitStatus>('git_stage', { workspaceId, paths }),
  stageAll: (workspaceId: string) =>
    call<GitStatus>('git_stage_all', { workspaceId }),
  unstage: (workspaceId: string, paths: string[]) =>
    call<GitStatus>('git_unstage', { workspaceId, paths }),
  commit: (workspaceId: string, message: string) =>
    call<GitCommit>('git_commit', { workspaceId, message }),
  createBranch: (
    workspaceId: string,
    name: string,
    startPoint: string | null = null,
  ) =>
    call<GitBranches>('git_create_branch', { workspaceId, name, startPoint }),
  checkoutBranch: (workspaceId: string, name: string) =>
    call<GitStatus>('git_checkout_branch', { workspaceId, name }),
  deleteBranch: (workspaceId: string, name: string) =>
    call<boolean>('git_delete_branch', { workspaceId, name }),
  history: (
    workspaceId: string,
    skip: number,
    limit: number,
    path: string | null = null,
  ) => call<GitHistory>('git_history', { workspaceId, skip, limit, path }),
  diff: (workspaceId: string, path: string, staged: boolean) =>
    call<GitFileDiff>('git_diff', { workspaceId, path, staged }),
  diffSummary: (workspaceId: string, staged: boolean) =>
    call<GitDiffStat[]>('git_diff_summary', { workspaceId, staged }),
  // The destination parent comes from a native picker, so null means the user cancelled it.
  clone: (workspaceId: string | null, source: string, folder: string) =>
    call<GitCloneOutcome | null>('git_clone_repository', {
      workspaceId,
      source,
      folder,
    }),
  fetch: (workspaceId: string, remote: string | null = null) =>
    call<GitStatus>('git_fetch', { workspaceId, remote }),
  pull: (workspaceId: string) => call<GitStatus>('git_pull', { workspaceId }),
  push: (workspaceId: string, setUpstream = false) =>
    call<GitStatus>('git_push', { workspaceId, setUpstream }),
};
