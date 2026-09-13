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
let generation = 0;
let queue = Promise.resolve();
let queued = 0;
let startupEvents: TerminalEvent[] | null = null;
let detachedOutput: { id: string; data: string }[] = [];
const cleanup = new Set<string>();
function report(error: unknown) {
  set({ error: (error as ServiceError)?.message || String(error) });
}
function perform(action: () => Promise<void>) {
  queued++;
  set({ busy: true, error: null });
  queue = queue
    .then(action)
    .catch(report)
    .finally(() => {
      queued--;
      set({ busy: queued > 0 });
    });
  return queue;
}
function receive(event: TerminalEvent) {
  if (event.id === get().session?.id) {
    if (event.kind === 'output') {
      if (sink) sink(event.data);
      else detachedOutput.push(event);
    } else set({ status: 'exited', exitCode: event.code });
  } else startupEvents?.push(event);
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
async function stopRetired() {
  for (const id of cleanup) {
    try {
      await terminal.stop(id);
    } catch (error) {
      if ((error as ServiceError)?.code !== 'NO_TERMINAL') throw error;
    }
    cleanup.delete(id);
  }
}
function launch(restart: boolean) {
  const workspace = useWorkspace.getState().workspace;
  const request = generation;
  return perform(async () => {
    await stopRetired();
    if (!workspace || request !== generation) return;
    const previous = get().session;
    if (previous && !restart) return;
    await subscribe();
    if (request !== generation) return;
    // Keep early ConPTY output until the returned session id can identify its owner.
    startupEvents = [];
    detachedOutput = [];
    set({ session: null, status: 'idle', exitCode: null });
    if (previous) cleanup.add(previous.id);
    try {
      const session = previous
        ? await terminal.restart(workspace.id, previous.id)
        : await terminal.start(workspace.id);
      if (previous) cleanup.delete(previous.id);
      if (request !== generation) {
        cleanup.add(session.id);
        await stopRetired();
        return;
      }
      set({ session, status: 'running', exitCode: null });
      const events = startupEvents;
      startupEvents = null;
      for (const event of events) receive(event);
    } finally {
      startupEvents = null;
    }
  });
}
function closeSession() {
  generation++;
  detachedOutput = [];
  const session = get().session;
  if (session) cleanup.add(session.id);
  set({ session: null, status: 'idle', exitCode: null, visible: false });
  return perform(stopRetired);
}
export const actions = {
  toggle: () => {
    if (useWorkspace.getState().workspace) set({ visible: !get().visible });
  },
  hide: () => set({ visible: false }),
  start: () => launch(false),
  restart: () => launch(true),
  close: closeSession,
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
    const output = detachedOutput;
    detachedOutput = [];
    for (const event of output) {
      if (event.id === get().session?.id) write(event.data);
    }
    return () => {
      if (sink === write) sink = null;
    };
  },
  dismissError: () => set({ error: null }),
};
useWorkspace.subscribe((state, previous) => {
  if (state.workspace?.id === previous.workspace?.id) return;
  if (get().session || queued || cleanup.size) void closeSession();
  else {
    generation++;
    set({ session: null, status: 'idle', exitCode: null, visible: false });
  }
});
