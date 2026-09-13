import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useTerminal } from '../src/stores/terminal';
import { useWorkspace } from '../src/stores/workspace';
import { terminal } from '../src/services/terminal';
import type { TerminalEvent } from '../src/types/terminal';
vi.mock('../src/services/terminal', () => ({
  terminal: {
    start: vi.fn(),
    restart: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    stop: vi.fn(),
    listen: vi.fn(),
  },
}));
const session = (id: string) => ({ id, shell: 'cmd.exe' });
const order: string[] = [];
let emit: (event: TerminalEvent) => void = () => {};
beforeEach(() => {
  vi.resetAllMocks();
  useTerminal.setState({ ...useTerminal.getInitialState() }, true);
  useWorkspace.setState(
    {
      ...useWorkspace.getInitialState(),
      workspace: { id: '1', name: 'test', path: 'C:/test' },
    },
    true,
  );
  vi.mocked(terminal.listen).mockImplementation(async (handler) => {
    emit = handler;
    order.push('listen');
    return () => {};
  });
  vi.mocked(terminal.start).mockImplementation(async () => {
    order.push('start');
    return session('t1');
  });
  vi.mocked(terminal.restart).mockResolvedValue(session('t2'));
  vi.mocked(terminal.stop).mockResolvedValue(undefined);
  vi.mocked(terminal.write).mockResolvedValue(undefined);
  vi.mocked(terminal.resize).mockResolvedValue(undefined);
  order.length = 0;
});
test('subscribes to terminal events before the first shell starts', async () => {
  // ConPTY only starts the shell once the terminal answers its cursor query, so output that
  // arrives before the listener exists would hang the session.
  await actions.start();
  expect(order).toEqual(['listen', 'start']);
  expect(useTerminal.getState()).toMatchObject({
    session: session('t1'),
    status: 'running',
  });
});
test('output reaches the attached view and stops once it detaches', async () => {
  const received: string[] = [];
  const detach = actions.attach((data) => received.push(data));
  await actions.start();
  emit({ kind: 'output', id: 't1', data: 'hello' });
  detach();
  emit({ kind: 'output', id: 't1', data: 'dropped' });
  expect(received).toEqual(['hello']);
});
test('only the current session can report an exit', async () => {
  await actions.start();
  emit({ kind: 'exit', id: 'replaced', code: 1 });
  expect(useTerminal.getState().status).toBe('running');
  emit({ kind: 'exit', id: 't1', code: 3 });
  expect(useTerminal.getState()).toMatchObject({
    status: 'exited',
    exitCode: 3,
  });
});
test('restarting replaces the session and clears the exit state', async () => {
  await actions.start();
  emit({ kind: 'exit', id: 't1', code: 1 });
  await actions.restart();
  expect(terminal.restart).toHaveBeenCalledWith('1', 't1');
  expect(useTerminal.getState()).toMatchObject({
    session: session('t2'),
    status: 'running',
    exitCode: null,
  });
});
test('keystrokes and resizes reach the running shell', async () => {
  await actions.start();
  actions.send('dir\r');
  actions.resize(120, 30);
  expect(terminal.write).toHaveBeenCalledWith('t1', 'dir\r');
  expect(terminal.resize).toHaveBeenCalledWith('t1', 120, 30);
});
test('closing stops the shell, hides the panel, and silences input', async () => {
  await actions.start();
  actions.toggle();
  await actions.close();
  expect(terminal.stop).toHaveBeenCalledWith('t1');
  expect(useTerminal.getState()).toMatchObject({
    session: null,
    status: 'idle',
    visible: false,
  });
  actions.send('dir\r');
  expect(terminal.write).not.toHaveBeenCalled();
});
test('opening another workspace stops the running shell', async () => {
  await actions.start();
  useWorkspace.setState({
    workspace: { id: '2', name: 'other', path: 'C:/other' },
  });
  await vi.waitFor(() => expect(terminal.stop).toHaveBeenCalledWith('t1'));
  expect(useTerminal.getState().session).toBeNull();
});
test('the terminal cannot be opened without a workspace', () => {
  useWorkspace.setState({ workspace: null });
  actions.toggle();
  expect(useTerminal.getState().visible).toBe(false);
});
test('a failed start reports the error and leaves no session', async () => {
  vi.mocked(terminal.start).mockRejectedValue({
    code: 'DESKTOP_REQUIRED',
    message: 'Open the TBCE desktop app to use the terminal.',
  });
  await actions.start();
  expect(useTerminal.getState().error).toContain('desktop app');
  expect(useTerminal.getState().session).toBeNull();
});

test('workspace changes retire a shell whose start has not returned yet', async () => {
  let finish!: (value: ReturnType<typeof session>) => void;
  vi.mocked(terminal.start).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const starting = actions.start();
  await vi.waitFor(() => expect(terminal.start).toHaveBeenCalled());
  useWorkspace.setState({
    workspace: { id: '2', name: 'other', path: 'C:/other' },
  });
  finish(session('late'));
  await starting;
  await vi.waitFor(() => expect(useTerminal.getState().busy).toBe(false));
  expect(terminal.stop).toHaveBeenCalledWith('late');
  expect(useTerminal.getState().session).toBeNull();
});

test('workspace changes during restart clean up the replacement session', async () => {
  await actions.start();
  let finish!: (value: ReturnType<typeof session>) => void;
  vi.mocked(terminal.restart).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const restarting = actions.restart();
  await vi.waitFor(() => expect(terminal.restart).toHaveBeenCalled());
  useWorkspace.setState({ workspace: null });
  finish(session('late-restart'));
  await restarting;
  await vi.waitFor(() => expect(useTerminal.getState().busy).toBe(false));
  expect(terminal.stop).toHaveBeenCalledWith('late-restart');
  expect(useTerminal.getState().session).toBeNull();
});

test('startup output and exits are buffered by session and stale output is discarded', async () => {
  const received: string[] = [];
  const detach = actions.attach((data) => received.push(data));
  vi.mocked(terminal.start).mockImplementation(async () => {
    emit({ kind: 'output', id: 'old', data: 'stale' });
    emit({ kind: 'output', id: 't1', data: '\x1b[6n' });
    emit({ kind: 'exit', id: 't1', code: 4 });
    return session('t1');
  });
  await actions.start();
  emit({ kind: 'output', id: 'old', data: 'also stale' });
  expect(received).toEqual(['\x1b[6n']);
  expect(useTerminal.getState()).toMatchObject({
    status: 'exited',
    exitCode: 4,
  });
  detach();
});

test('failed cleanup is retried before starting another shell', async () => {
  await actions.start();
  vi.mocked(terminal.stop).mockRejectedValueOnce({
    code: 'STOP_FAILED',
    message: 'Still running',
  });
  await actions.close();
  expect(useTerminal.getState().error).toBe('Still running');
  await actions.start();
  expect(terminal.stop).toHaveBeenCalledTimes(2);
  expect(useTerminal.getState().session?.id).toBe('t1');
});

test('a view remount receives early output after hiding during startup', async () => {
  await actions.start();
  emit({ kind: 'output', id: 't1', data: '\x1b[6n' });
  const received = vi.fn();
  const detach = actions.attach(received);
  expect(received).toHaveBeenCalledWith('\x1b[6n');
  detach();
});
