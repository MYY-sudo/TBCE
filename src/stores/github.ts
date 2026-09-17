import { create } from 'zustand';
import { github } from '../services/github';
import { useWorkspace } from './workspace';
import type {
  GitHubAccount,
  GitHubActivity,
  GitHubBranch,
  GitHubCommit,
  GitHubLink,
  GitHubPage,
  GitHubRateLimit,
  GitHubRepository,
} from '../types/github';
import type { ServiceError, Workspace } from '../types/workspace';
export type GitHubTab = 'overview' | 'branches' | 'commits';
interface GitHubState {
  account: GitHubAccount;
  link: GitHubLink;
  repository: GitHubRepository | null;
  branches: GitHubBranch[];
  branchPage: number;
  branchesMore: boolean;
  commits: GitHubCommit[];
  commitPage: number;
  commitsMore: boolean;
  activity: GitHubActivity[];
  /// Repository activity needs more access than repository metadata, so a refusal is recorded here
  /// and leaves the rest of the panel intact.
  activityDenied: boolean;
  activityError: string | null;
  rate: GitHubRateLimit | null;
  tab: GitHubTab;
  /// Two flags, not one: loading commits must not disable Sign out, and signing out must not look
  /// like the repository is still loading.
  accountBusy: boolean;
  dataBusy: boolean;
  error: string | null;
  notice: string | null;
}
/// Everything that belongs to one repository. The account deliberately sits outside it, because
/// signing in is global and opening another folder must not undo it.
const empty = {
  repository: null,
  branches: [] as GitHubBranch[],
  branchPage: 1,
  branchesMore: false,
  commits: [] as GitHubCommit[],
  commitPage: 1,
  commitsMore: false,
  activity: [] as GitHubActivity[],
  activityDenied: false,
  activityError: null as string | null,
  rate: null as GitHubRateLimit | null,
};
const initial: GitHubState = {
  account: { status: 'signedOut' },
  link: { status: 'noRepository' },
  ...empty,
  tab: 'overview',
  accountBusy: false,
  dataBusy: false,
  error: null,
  notice: null,
};
export const useGitHub = create<GitHubState>(() => ({ ...initial }));
const set = useGitHub.setState;
const get = useGitHub.getState;
// A GitHub answer can outlive the workspace it was asked about, so each repository request is
// numbered and a late answer for a replaced workspace is discarded rather than displayed. The same
// flag serializes the panel: a second read started while one runs is refused rather than queued,
// because the backend serializes GitHub access anyway.
let request = 0;
let linkRequest = 0;
const isCurrent = (id: string | undefined) =>
  useWorkspace.getState().workspace?.id === id;
const workspaceId = () => useWorkspace.getState().workspace?.id;
const failed = (error: unknown) =>
  (error as ServiceError)?.message || String(error);
const authenticationFailed = (error: unknown) =>
  ['GITHUB_AUTH_FAILED', 'GITHUB_SIGNED_OUT'].includes(
    (error as ServiceError)?.code,
  );
async function run(
  id: string,
  work: (current: () => boolean) => Promise<Partial<GitHubState> | null>,
): Promise<boolean> {
  if (get().accountBusy || get().dataBusy || !isCurrent(id)) return false;
  const current = ++request;
  set({ dataBusy: true, error: null, notice: null });
  try {
    const changes = await work(() => current === request && isCurrent(id));
    if (current !== request || !isCurrent(id)) return false;
    if (changes) set(changes);
    return true;
  } catch (error) {
    if (current !== request || !isCurrent(id)) return false;
    if (authenticationFailed(error)) {
      request++;
      set({ ...empty, account: { status: 'signedOut' }, dataBusy: false });
    }
    set({ error: failed(error) });
    return false;
  } finally {
    if (current === request) set({ dataBusy: false });
  }
}
const perform = (
  work: (
    id: string,
    current: () => boolean,
  ) => Promise<Partial<GitHubState> | null>,
) => {
  const id = workspaceId();
  return id ? run(id, (current) => work(id, current)) : Promise.resolve(false);
};
/// Account work is not workspace-scoped, so it has its own single-flight flag and no workspace
/// check. There is nothing for a workspace change to invalidate about who is signed in.
async function account(
  work: () => Promise<GitHubAccount | null>,
): Promise<boolean> {
  if (get().accountBusy) return false;
  // Account validation/replacement is a boundary for all pending repository reads.
  request++;
  set({ accountBusy: true, dataBusy: false, error: null, notice: null });
  try {
    const answer = await work();
    if (answer)
      set({ ...(answer.status === 'signedOut' ? empty : {}), account: answer });
    return true;
  } catch (error) {
    set({ error: failed(error) });
    return false;
  } finally {
    set({ accountBusy: false });
  }
}
/// One read of everything the panel shows, so switching tabs runs nothing at all. Four requests
/// against a 5000-per-hour allowance buys a panel that never waits when a tab is selected.
async function reload(
  id: string,
  current: () => boolean,
): Promise<Partial<GitHubState> | null> {
  const link = await github.link(id);
  if (!current()) return null;
  if (link.status !== 'found' || get().account.status !== 'signedIn')
    return { link, ...empty };
  const repository = await github.repository(id);
  if (!current()) return null;
  const branches = await github.branches(id, 1);
  if (!current()) return null;
  let commits: GitHubPage<GitHubCommit> = {
    items: [],
    page: 1,
    hasMore: false,
    rate: null,
  };
  let error: string | null = null;
  try {
    commits = await github.commits(id, 1);
  } catch (failure) {
    if (authenticationFailed(failure)) throw failure;
    // Keep the readable overview even if commit history is temporarily unavailable.
    error = failed(failure);
  }
  if (!current()) return null;
  // Activity can be refused for a repository whose metadata is readable, which is a missing
  // section rather than a failed refresh.
  let activity: GitHubActivity[] = [];
  let activityDenied = false;
  let activityError: string | null = null;
  try {
    activity = (await github.activity(id, 1)).items;
  } catch (failure) {
    if (authenticationFailed(failure)) throw failure;
    activityDenied = (failure as ServiceError)?.code === 'GITHUB_FORBIDDEN';
    if (!activityDenied) activityError = failed(failure);
  }
  return {
    link,
    repository,
    branches: branches.items,
    branchPage: 1,
    branchesMore: branches.hasMore,
    commits: commits.items,
    commitPage: 1,
    commitsMore: commits.hasMore,
    activity,
    activityDenied,
    activityError,
    error,
    rate: commits.rate ?? repository.rate ?? null,
  };
}
export const actions = {
  /// Who is signed in. Reads the credential vault and asks GitHub to confirm the token still
  /// works, which is also what reports the current rate limit.
  loadAccount: () => account(() => github.account()),
  signIn: (token: string) =>
    account(async () => {
      const answer = await github.signIn(token);
      set({ ...empty, notice: 'GitHub account connected.' });
      return answer;
    }),
  signOut: () =>
    account(async () => {
      await github.signOut();
      set({ ...empty, notice: 'GitHub account disconnected.' });
      return { status: 'signedOut' as const };
    }),
  /// Runs Git and no request, so opening a folder never waits on GitHub to find out whether there
  /// is anything to ask about.
  detect: async (workspace: Workspace) => {
    if (!isCurrent(workspace.id)) return;
    const current = ++linkRequest;
    try {
      const link = await github.link(workspace.id);
      if (current !== linkRequest || !isCurrent(workspace.id)) return;
      set({ link });
    } catch (error) {
      if (current !== linkRequest || !isCurrent(workspace.id)) return;
      // A folder with no GitHub remote is a normal state, not an error to report.
      set({ link: { status: 'noRepository' }, error: failed(error) });
    }
  },
  refresh: () => perform(reload),
  setTab: (tab: GitHubTab) => set({ tab }),
  moreBranches: () =>
    perform(async (id) => {
      const page = await github.branches(id, get().branchPage + 1);
      return {
        branches: [...get().branches, ...page.items],
        branchPage: page.page,
        branchesMore: page.hasMore,
        rate: page.rate ?? get().rate,
      };
    }),
  moreCommits: () =>
    perform(async (id) => {
      const page = await github.commits(id, get().commitPage + 1);
      return {
        commits: [...get().commits, ...page.items],
        commitPage: page.page,
        commitsMore: page.hasMore,
        rate: page.rate ?? get().rate,
      };
    }),
  dismissError: () => set({ error: null }),
  dismissNotice: () => set({ notice: null }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id === previous.workspace?.id) return;
  request++;
  linkRequest++;
  // The account survives a workspace change; everything about the repository does not.
  set({ ...initial, account: get().account, accountBusy: get().accountBusy });
  if (state.workspace) void actions.detect(state.workspace);
});
