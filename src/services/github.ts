import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  GitHubAccount,
  GitHubActivity,
  GitHubBranch,
  GitHubCloseReason,
  GitHubCommit,
  GitHubIssue,
  GitHubIssueChoices,
  GitHubIssueCreated,
  GitHubIssueDetail,
  GitHubIssueDraft,
  GitHubIssueFilter,
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
// identifier, a page number and values it checks. signIn is the only call that carries a token, and
// nothing returns one. The three issue changes are the only calls that write to GitHub.
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
  issues: (workspaceId: string, filter: GitHubIssueFilter, page = 1) =>
    call<GitHubPage<GitHubIssue>>('github_issues', {
      workspaceId,
      filter,
      page,
    }),
  issue: (workspaceId: string, number: number) =>
    call<GitHubIssueDetail>('github_issue', { workspaceId, number }),
  issueChoices: (workspaceId: string) =>
    call<GitHubIssueChoices>('github_issue_choices', { workspaceId }),
  createIssue: (workspaceId: string, draft: GitHubIssueDraft) =>
    call<GitHubIssueCreated>('github_create_issue', { workspaceId, draft }),
  closeIssue: (
    workspaceId: string,
    number: number,
    reason: GitHubCloseReason,
  ) =>
    call<GitHubIssueDetail>('github_close_issue', {
      workspaceId,
      number,
      reason,
    }),
  reopenIssue: (workspaceId: string, number: number) =>
    call<GitHubIssueDetail>('github_reopen_issue', { workspaceId, number }),
};
