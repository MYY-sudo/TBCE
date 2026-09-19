import { create } from 'zustand';
import { github } from '../services/github';
import { useWorkspace } from './workspace';
import { actions as gitActions, useGit } from './git';
import { actions as githubActions, useGitHub } from './github';
import type {
  GitHubCounts,
  GitHubHeadChecks,
  GitHubMilestone,
} from '../types/github';
import type { ServiceError } from '../types/workspace';
interface DashboardState {
  /// Shown over open tabs. With no file open the dashboard shows whatever this says.
  open: boolean;
  counts: GitHubCounts | null;
  countsDenied: boolean;
  countsError: string | null;
  milestones: GitHubMilestone[];
  milestonesMore: boolean;
  milestonesDenied: boolean;
  milestonesError: string | null;
  head: GitHubHeadChecks | null;
  headError: string | null;
  busy: boolean;
}
/// What the dashboard reads from GitHub itself. Repository, activity, issues and pull requests
/// belong to the GitHub store, which the dashboard asks to refresh rather than duplicating.
const remote = {
  counts: null as GitHubCounts | null,
  countsDenied: false,
  countsError: null as string | null,
  milestones: [] as GitHubMilestone[],
  milestonesMore: false,
  milestonesDenied: false,
  milestonesError: null as string | null,
  head: null as GitHubHeadChecks | null,
  headError: null as string | null,
};
const initial: DashboardState = { open: false, ...remote, busy: false };
export const useDashboard = create<DashboardState>(() => ({ ...initial }));
const set = useDashboard.setState;
const get = useDashboard.getState;
// Like the GitHub store, each read is numbered so a late answer for a replaced workspace is
// discarded, and a read started while one runs is refused rather than queued.
let request = 0;
const isCurrent = (id: string | undefined) =>
  useWorkspace.getState().workspace?.id === id;
const failed = (error: unknown) =>
  (error as ServiceError)?.message || String(error);
const code = (error: unknown) => (error as ServiceError)?.code;
const authenticationFailed = (error: unknown) =>
  ['GITHUB_AUTH_FAILED', 'GITHUB_SIGNED_OUT'].includes(code(error));
/// Reads one section. A refusal or failure belongs to that section alone; only a rejected token
/// stops the rest, because nothing else can be read with it either.
async function section<T>(
  read: () => Promise<T>,
): Promise<{ value: T | null; denied: boolean; error: string | null }> {
  try {
    return { value: await read(), denied: false, error: null };
  } catch (failure) {
    if (authenticationFailed(failure)) throw failure;
    const denied = code(failure) === 'GITHUB_FORBIDDEN';
    return { value: null, denied, error: denied ? null : failed(failure) };
  }
}
const connected = () => {
  const state = useGitHub.getState();
  return state.account.status === 'signedIn' && state.link.status === 'found';
};
export const actions = {
  /// Counts, milestones and the checks of the local HEAD. Nothing is asked while signed out or
  /// when the folder has no GitHub remote.
  refresh: async (): Promise<boolean> => {
    const id = useWorkspace.getState().workspace?.id;
    if (!id || get().busy) return false;
    if (!connected()) {
      set({ ...remote });
      return true;
    }
    const current = ++request;
    const live = () => current === request && isCurrent(id);
    set({ busy: true });
    try {
      const counts = await section(() => github.counts(id));
      if (!live()) return false;
      const milestones = await section(() => github.milestones(id));
      if (!live()) return false;
      const head = await section(() => github.headChecks(id));
      if (!live()) return false;
      set({
        counts: counts.value,
        countsDenied: counts.denied,
        countsError: counts.error,
        milestones: milestones.value?.items ?? [],
        milestonesMore: milestones.value?.hasMore ?? false,
        milestonesDenied: milestones.denied,
        milestonesError: milestones.error,
        head: head.value,
        // A refused checks read is reported inside the answer, so only a failure is kept here.
        headError:
          head.error ?? (head.denied ? 'GitHub refused this read.' : null),
      });
      return true;
    } catch (error) {
      if (!live()) return false;
      set({ ...remote });
      // The token is gone from the vault already; reading the account resets the GitHub store.
      if (authenticationFailed(error)) void githubActions.loadAccount();
      return false;
    } finally {
      if (current === request) set({ busy: false });
    }
  },
  /// Everything the dashboard shows: local Git, the GitHub store, then its own reads.
  refreshAll: async () => {
    if (useGit.getState().detection.status === 'found')
      void gitActions.refresh();
    if (connected()) void githubActions.refresh();
    return actions.refresh();
  },
  /// Shown over open tabs. Only one thing occupies the editor area, so a diff or patch is closed.
  show: () => {
    gitActions.closeDiff();
    githubActions.closePullFile();
    set({ open: true });
  },
  hide: () => set({ open: false }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id !== previous.workspace?.id) {
    request++;
    set({ ...initial });
    return;
  }
  // Choosing a file puts it in front of the dashboard.
  if (state.activeId !== previous.activeId && get().open) set({ open: false });
});
useGit.subscribe((state, previous) => {
  if (state.selected && state.selected !== previous.selected && get().open)
    set({ open: false });
});
useGitHub.subscribe((state, previous) => {
  if (state.pullFile && state.pullFile !== previous.pullFile && get().open)
    set({ open: false });
  // Nothing read with an account survives signing out of it.
  if (
    state.account.status === 'signedOut' &&
    previous.account.status === 'signedIn'
  ) {
    request++;
    set({ ...remote, busy: false });
  }
});
