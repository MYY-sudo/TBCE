import { create } from 'zustand';
import { github } from '../services/github';
import { useWorkspace } from './workspace';
import type {
  GitHubAccount,
  GitHubActivity,
  GitHubBranch,
  GitHubCloseReason,
  GitHubCommit,
  GitHubIssue,
  GitHubIssueChoices,
  GitHubIssueDetail,
  GitHubIssueDraft,
  GitHubIssueFilter,
  GitHubLink,
  GitHubPage,
  GitHubRateLimit,
  GitHubRepository,
} from '../types/github';
import { droppedLabel, matchesFilter } from '../types/github';
import type { ServiceError, Workspace } from '../types/workspace';
export type GitHubTab = 'overview' | 'branches' | 'commits' | 'issues';
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
  issues: GitHubIssue[];
  issuePage: number;
  issuesMore: boolean;
  /// Like activity, issues can be refused or turned off while the rest of the repository reads
  /// fine, so each is its own state rather than a failed refresh.
  issuesDenied: boolean;
  issuesDisabled: boolean;
  issuesError: string | null;
  issueFilter: GitHubIssueFilter;
  /// Labels, assignees and milestones for the filters and the form. Read on first use, not on
  /// every refresh.
  choices: GitHubIssueChoices | null;
  selectedIssue: GitHubIssueDetail | null;
  composing: boolean;
  /// Kept here rather than in the form, so a failed create or a panel switch loses no typing.
  draft: GitHubIssueDraft;
  rate: GitHubRateLimit | null;
  tab: GitHubTab;
  /// Two flags, not one: loading commits must not disable Sign out, and signing out must not look
  /// like the repository is still loading.
  accountBusy: boolean;
  dataBusy: boolean;
  error: string | null;
  notice: string | null;
}
const openIssues: GitHubIssueFilter = {
  state: 'open',
  label: null,
  assignee: null,
  milestone: null,
};
const blankDraft: GitHubIssueDraft = {
  title: '',
  body: '',
  labels: [],
  assignees: [],
  milestone: null,
};
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
  issues: [] as GitHubIssue[],
  issuePage: 1,
  issuesMore: false,
  issuesDenied: false,
  issuesDisabled: false,
  issuesError: null as string | null,
  issueFilter: openIssues,
  choices: null as GitHubIssueChoices | null,
  selectedIssue: null as GitHubIssueDetail | null,
  composing: false,
  draft: blankDraft,
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
const code = (error: unknown) => (error as ServiceError)?.code;
/// A write refused for want of permission says which permission, because the token that reads the
/// panel may not be allowed to change anything.
async function writing<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (code(error) !== 'GITHUB_FORBIDDEN') throw error;
    throw {
      code: 'GITHUB_FORBIDDEN',
      message: `${failed(error)} Changing issues needs a fine-grained token with Issues: Read and write, or a classic token with the repo or public_repo scope.`,
    };
  }
}
/// The first page of issues matching a filter, with a refusal recorded as a state of the Issues
/// section rather than a failed refresh.
async function firstIssues(
  id: string,
  filter: GitHubIssueFilter,
): Promise<Partial<GitHubState>> {
  try {
    const page = await github.issues(id, filter, 1);
    return {
      issues: page.items,
      issuePage: 1,
      issuesMore: page.hasMore,
      issuesDenied: false,
      issuesDisabled: false,
      issuesError: null,
    };
  } catch (failure) {
    if (authenticationFailed(failure)) throw failure;
    const refused = code(failure);
    return {
      issues: [],
      issuePage: 1,
      issuesMore: false,
      issuesDenied: refused === 'GITHUB_FORBIDDEN',
      issuesDisabled: refused === 'GITHUB_ISSUES_DISABLED',
      issuesError: ['GITHUB_FORBIDDEN', 'GITHUB_ISSUES_DISABLED'].includes(
        refused,
      )
        ? null
        : failed(failure),
    };
  }
}
/// An issue changed on GitHub, reflected in the list without reading it again: replaced where it
/// still matches the filter, removed where it no longer does.
function changed(detail: GitHubIssueDetail): Partial<GitHubState> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { body, rate, ...issue } = detail;
  const keep = matchesFilter(issue, get().issueFilter);
  return {
    selectedIssue: detail,
    issues: keep
      ? get().issues.map((entry) =>
          entry.number === issue.number ? issue : entry,
        )
      : get().issues.filter((entry) => entry.number !== issue.number),
    rate: rate ?? get().rate,
  };
}
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
/// One read of everything the panel shows, so switching tabs runs nothing at all. Five requests
/// (six with an issue open) against a 5000-per-hour allowance buys a panel that never waits when a
/// tab is selected.
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
  // Issues turned off are known from the repository itself, so nothing is asked in that case.
  const issues: Partial<GitHubState> =
    repository.hasIssues === false
      ? { issuesDisabled: true }
      : await firstIssues(id, get().issueFilter);
  if (!current()) return null;
  // An issue on screen is read again so it cannot show a state older than the list beside it.
  let selectedIssue: GitHubIssueDetail | null = null;
  const selected = get().selectedIssue;
  if (selected && !issues.issuesDisabled) {
    try {
      selectedIssue = await github.issue(id, selected.number);
    } catch (failure) {
      if (authenticationFailed(failure)) throw failure;
    }
    if (!current()) return null;
  }
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
    issues: issues.issues ?? [],
    issuePage: 1,
    issuesMore: issues.issuesMore ?? false,
    issuesDenied: issues.issuesDenied ?? false,
    issuesDisabled: issues.issuesDisabled ?? false,
    issuesError: issues.issuesError ?? null,
    choices: null,
    selectedIssue,
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
  /// Reads the first page for a new filter. The filter is only kept once GitHub has answered, so
  /// the controls never show a filter the list does not reflect.
  setIssueFilter: (changes: Partial<GitHubIssueFilter>) =>
    perform(async (id) => {
      const filter = { ...get().issueFilter, ...changes };
      const page = await github.issues(id, filter, 1);
      return {
        issueFilter: filter,
        issues: page.items,
        issuePage: 1,
        issuesMore: page.hasMore,
        issuesDenied: false,
        issuesDisabled: false,
        issuesError: null,
        selectedIssue: null,
        rate: page.rate ?? get().rate,
      };
    }),
  moreIssues: () =>
    perform(async (id) => {
      const page = await github.issues(
        id,
        get().issueFilter,
        get().issuePage + 1,
      );
      const known = new Set(get().issues.map((issue) => issue.number));
      return {
        // An issue opened between two pages shifts the rest along, so one can arrive twice.
        issues: [
          ...get().issues,
          ...page.items.filter((issue) => !known.has(issue.number)),
        ],
        issuePage: page.page,
        issuesMore: page.hasMore,
        rate: page.rate ?? get().rate,
      };
    }),
  openIssue: (number: number) =>
    perform(async (id) => {
      const detail = await github.issue(id, number);
      return {
        selectedIssue: detail,
        composing: false,
        rate: detail.rate ?? get().rate,
      };
    }),
  closeIssue: (reason: GitHubCloseReason) =>
    perform(async (id) => {
      const number = get().selectedIssue?.number;
      if (!number) return null;
      const detail = await writing(() => github.closeIssue(id, number, reason));
      return { ...changed(detail), notice: `Issue #${number} closed.` };
    }),
  reopenIssue: () =>
    perform(async (id) => {
      const number = get().selectedIssue?.number;
      if (!number) return null;
      const detail = await writing(() => github.reopenIssue(id, number));
      return { ...changed(detail), notice: `Issue #${number} reopened.` };
    }),
  backToIssues: () => set({ selectedIssue: null }),
  /// Labels, assignees and milestones, read once when the filters or the form first need them.
  loadChoices: () =>
    get().choices
      ? Promise.resolve(true)
      : perform(async (id) => {
          const choices = await github.issueChoices(id);
          return { choices, rate: choices.rate ?? get().rate };
        }),
  compose: (composing: boolean) =>
    set({
      composing,
      selectedIssue: composing ? null : get().selectedIssue,
    }),
  editDraft: (changes: Partial<GitHubIssueDraft>) =>
    set({ draft: { ...get().draft, ...changes } }),
  createIssue: () =>
    perform(async (id, current) => {
      const created = await writing(() => github.createIssue(id, get().draft));
      const number = created.issue.number;
      const notice =
        droppedLabel(created.dropped) ?? `Issue #${number} created.`;
      // The issue exists now whatever happens next, so a failed re-read of the list is reported
      // in the list and never presented as a failed create.
      const list = current() ? await firstIssues(id, get().issueFilter) : {};
      return {
        ...list,
        selectedIssue: created.issue,
        composing: false,
        draft: blankDraft,
        rate: created.issue.rate ?? get().rate,
        notice,
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
