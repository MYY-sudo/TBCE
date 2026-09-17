import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  GitHubAccount,
  GitHubActivity,
  GitHubBranch,
  GitHubCommit,
  GitHubLink,
  GitHubPage,
  GitHubRepository,
} from '../types/github';
function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: 'DESKTOP_REQUIRED',
      message:
        'Open the TBCE desktop app to use GitHub. Use npm run tauri dev during development.',
    });
  return invoke<T>(command, args);
}
// No call names a host, a path or a header: the backend builds every request from a workspace
// identifier and a page number. signIn is the only call that carries a token, and nothing returns
// one.
export const github = {
  account: () => call<GitHubAccount>('github_account'),
  signIn: (token: string) => call<GitHubAccount>('github_sign_in', { token }),
  signOut: () => call<void>('github_sign_out'),
  // Reads the workspace's own Git remote and runs no request at all.
  link: (workspaceId: string) =>
    call<GitHubLink>('github_link', { workspaceId }),
  repository: (workspaceId: string) =>
    call<GitHubRepository>('github_repository', { workspaceId }),
  branches: (workspaceId: string, page = 1) =>
    call<GitHubPage<GitHubBranch>>('github_branches', { workspaceId, page }),
  commits: (workspaceId: string, page = 1, reference: string | null = null) =>
    call<GitHubPage<GitHubCommit>>('github_commits', {
      workspaceId,
      page,
      reference,
    }),
  activity: (workspaceId: string, page = 1) =>
    call<GitHubPage<GitHubActivity>>('github_activity', { workspaceId, page }),
};
