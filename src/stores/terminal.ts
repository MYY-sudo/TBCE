import { create } from 'zustand';
import { terminal } from '../services/terminal';
import { useWorkspace } from './workspace';
import type { ServiceError } from '../types/workspace';
import type {
  TerminalEvent,
  TerminalSession,
  TerminalStatus,
} from '../types/terminal';
interface TerminalState {
  session: TerminalSession | null;
  status: TerminalStatus;
  exitCode: number | null;
  visible: boolean;
  busy: boolean;
  error: string | null;
}
const initial: TerminalState = {
  session: null,
  status: 'idle',
  exitCode: null,
  visible: false,
  busy: false,
  error: null,
};
export const useTerminal = create<TerminalState>(() => ({ ...initial }));
const get = useTerminal.getState;
const set = useTerminal.setState;
let sink: ((data: string) => void) | null = null;
let subscription: Promise<() => void> | null = null;
function report(error: unknown) {
  set({ error: (error as ServiceError)?.message || String(error) });
}
async function perform(action: () => Promise<void>) {
  if (get().busy) return;
  set({ busy: true, error: null });
  try {
    await action();
  } catch (error) {
    report(error);
  } finally {
    set({ busy: false });
  }
}
function receive(event: TerminalEvent) {
  if (event.kind === 'output') sink?.(event.data);
  // A session that was replaced can still report its exit after the next one started.
  else if (event.id === get().session?.id)
    set({ status: 'exited', exitCode: event.code });
}
async function subscribe() {
  if (!subscription) subscription = terminal.listen(receive);
  try {
    await subscription;
  } catch (error) {
    subscription = null;
    throw error;
  }
}
async function startSession() {
  const workspace = useWorkspace.getState().workspace;
  if (!workspace || get().session) return;
  // The shell only starts once the terminal answers the cursor query, so listen before spawning.
  await subscribe();
  set({
    session: await terminal.start(workspace.id),
    status: 'running',
    exitCode: null,
  });
}
async function restartSession() {
  const workspace = useWorkspace.getState().workspace;
  const session = get().session;
  if (!workspace) return;
  if (!session) return startSession();
  await subscribe();
  set({
    session: await terminal.restart(workspace.id, session.id),
    status: 'running',
    exitCode: null,
  });
}
async function closeSession() {
  const session = get().session;
  set({ session: null, status: 'idle', exitCode: null, visible: false });
  if (session) await terminal.stop(session.id);
}
export const actions = {
  toggle: () => {
    if (useWorkspace.getState().workspace) set({ visible: !get().visible });
  },
  hide: () => set({ visible: false }),
  start: () => perform(startSession),
  restart: () => perform(restartSession),
  close: () => perform(closeSession),
  send: (data: string) => {
    const session = get().session;
    if (session) void terminal.write(session.id, data).catch(report);
  },
  resize: (cols: number, rows: number) => {
    const session = get().session;
    if (session) void terminal.resize(session.id, cols, rows).catch(report);
  },
  attach: (write: (data: string) => void) => {
    sink = write;
    return () => {
      if (sink === write) sink = null;
    };
  },
  dismissError: () => set({ error: null }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id !== previous.workspace?.id && get().session)
    void actions.close();
});
