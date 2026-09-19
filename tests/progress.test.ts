import { beforeEach, expect, test, vi } from 'vitest';
import { actions, useProgress } from '../src/stores/progress';
import { useWorkspace } from '../src/stores/workspace';
import { progress } from '../src/services/progress';
import { fileSystem } from '../src/services/filesystem';
import {
  areaProgress,
  mappingKey,
  normalizePlan,
  planProblem,
  projectProgress,
  type ProgressArea,
  type ProgressPlan,
} from '../src/types/progress';
import type { GitHubAreaIssues } from '../src/types/github';
vi.mock('../src/services/progress', () => ({
  progress: { read: vi.fn(), write: vi.fn() },
}));
vi.mock('../src/services/filesystem', () => ({
  fileSystem: { list: vi.fn(), chooseWorkspace: vi.fn() },
}));
vi.mock('../src/services/project', () => ({
  projects: { detect: vi.fn().mockResolvedValue({ status: 'none' }) },
}));
const workspace = { id: '1', name: 'app', path: 'C:/code/app' };
const area = (changes: Partial<ProgressArea> = {}): ProgressArea => ({
  id: 'a1',
  name: 'Authentication',
  label: null,
  milestone: null,
  tasks: [
    { id: 't1', title: 'Login', done: true },
    { id: 't2', title: 'Register', done: false },
  ],
  ...changes,
});
const read = (
  ...issues: [number, 'open' | 'closed', boolean?][]
): GitHubAreaIssues => ({
  issues: issues.map(([number, state, notPlanned]) => ({
    number,
    title: `Issue ${number}`,
    state,
    notPlanned: notPlanned ?? false,
  })),
  truncated: false,
  rate: null,
});
const plan: ProgressPlan = { areas: [area()] };
beforeEach(() => {
  vi.resetAllMocks();
  useProgress.setState(useProgress.getInitialState(), true);
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  vi.mocked(fileSystem.list).mockResolvedValue([]);
});

test('an area counts its tasks and its closed issues, and never commits', () => {
  const figures = areaProgress(
    area({ label: 'area:auth' }),
    read([3, 'closed'], [4, 'open'], [5, 'closed']),
  );
  expect(figures).toMatchObject({
    tasksDone: 1,
    tasks: 2,
    issuesClosed: 2,
    issues: 3,
    done: 3,
    total: 5,
    percent: 60,
    issuesMissing: false,
  });
});

test('an issue closed as not planned is left out rather than counted as done', () => {
  const figures = areaProgress(
    area({ tasks: [], milestone: 2 }),
    read([1, 'closed'], [2, 'closed', true], [3, 'open']),
  );
  expect(figures).toMatchObject({
    issuesClosed: 1,
    issues: 2,
    notPlanned: 1,
    percent: 50,
  });
});

test('an area with nothing to measure has no percentage rather than zero', () => {
  expect(areaProgress(area({ tasks: [] }), null).percent).toBeNull();
  expect(
    areaProgress(area({ tasks: [], label: 'x' }), read()).percent,
  ).toBeNull();
});

test('a mapped area whose issues were not read stands for its tasks alone and says so', () => {
  const figures = areaProgress(area({ label: 'area:auth' }), null);
  expect(figures.issuesMissing).toBe(true);
  expect(figures.percent).toBe(50);
  expect(areaProgress(area(), null).issuesMissing).toBe(false);
});

test('the project counts an issue shared by two areas once', () => {
  const auth = area({ id: 'a', label: 'auth' });
  const teams = area({ id: 'b', name: 'Teams', milestone: 3, tasks: [] });
  const figures = projectProgress([auth, teams], (each) =>
    each.id === 'a' ? read([1, 'closed'], [2, 'open']) : read([2, 'open']),
  );
  expect(figures).toMatchObject({ tasks: 2, issues: 2, done: 2, total: 4 });
  expect(figures.percent).toBe(50);
});

test('mappings are keyed by label and milestone, and unmapped areas have none', () => {
  expect(mappingKey(area({ label: ' auth ', milestone: 2 }))).toBe('auth#2');
  expect(mappingKey(area({ label: '   ' }))).toBeNull();
  expect(mappingKey(area())).toBeNull();
});

test('the dialog checks what the backend would refuse', () => {
  const problem = (
    changes: Partial<ProgressArea>,
    extra: ProgressArea[] = [],
  ) => planProblem({ areas: [area(changes), ...extra] });
  expect(problem({})).toBeNull();
  expect(problem({ name: '  ' })).toMatch(/name for every area/);
  expect(problem({}, [area({ id: 'b', name: 'AUTHENTICATION' })])).toMatch(
    /two areas/,
  );
  expect(problem({ label: 'a,b' })).toMatch(/no commas/);
  expect(problem({ label: 'x'.repeat(51) })).toMatch(/at most 50/);
  expect(problem({ milestone: 0 })).toMatch(/milestone/);
  expect(problem({ tasks: [{ id: 't', title: ' ', done: false }] })).toMatch(
    /title for every task/,
  );
  expect(problem({ name: 'Auth\u0007' })).toMatch(/control character/);
});

test('a plan is trimmed before it is sent and a blank label dropped', () => {
  expect(
    normalizePlan({
      areas: [
        area({
          name: ' Auth ',
          label: '  ',
          tasks: [{ id: 't', title: ' Login ', done: false }],
        }),
      ],
    }).areas[0],
  ).toMatchObject({ name: 'Auth', label: null, tasks: [{ title: 'Login' }] });
});

test('loading reads the plan of the open folder', async () => {
  vi.mocked(progress.read).mockResolvedValue({
    status: 'found',
    plan,
    revision: 'r1',
  });
  useWorkspace.setState({ workspace });

  expect(await actions.load()).toBe(true);

  expect(progress.read).toHaveBeenCalledWith('1');
  expect(useProgress.getState()).toMatchObject({
    loaded: true,
    detection: { status: 'found', revision: 'r1' },
  });
});

test('a save names the revision it replaces, and the first save names none', async () => {
  useWorkspace.setState({ workspace });
  vi.mocked(progress.write).mockResolvedValue({ plan, revision: 'r2' });

  expect(await actions.save(plan)).toBe(true);
  expect(progress.write).toHaveBeenLastCalledWith('1', plan, null);

  expect(await actions.save(plan)).toBe(true);
  expect(progress.write).toHaveBeenLastCalledWith('1', plan, 'r2');
  expect(useProgress.getState().busy).toBe(false);
});

test('ticking a task saves the plan with only that task changed', async () => {
  useWorkspace.setState({ workspace });
  useProgress.setState({
    detection: { status: 'found', plan, revision: 'r1' },
    loaded: true,
  });
  vi.mocked(progress.write).mockImplementation(async (_, sent) => ({
    plan: sent,
    revision: 'r2',
  }));

  expect(await actions.toggleTask('a1', 't2')).toBe(true);

  const sent = vi.mocked(progress.write).mock.calls[0][1];
  expect(sent.areas[0].tasks.map((task) => task.done)).toEqual([true, true]);
  expect(vi.mocked(progress.write).mock.calls[0][2]).toBe('r1');
});

test('a plan changed on disk is not overwritten: the save is refused and the file read again', async () => {
  useWorkspace.setState({ workspace });
  useProgress.setState({
    detection: { status: 'found', plan, revision: 'r1' },
    loaded: true,
  });
  const theirs: ProgressPlan = { areas: [area({ name: 'Kimlik' })] };
  vi.mocked(progress.write).mockRejectedValue({
    code: 'CONFLICT',
    message: 'progress.json changed on disk since TBCE read it.',
  });
  vi.mocked(progress.read).mockResolvedValue({
    status: 'found',
    plan: theirs,
    revision: 'r9',
  });

  expect(await actions.toggleTask('a1', 't2')).toBe(false);

  await vi.waitFor(() =>
    expect(useProgress.getState().detection).toEqual({
      status: 'found',
      plan: theirs,
      revision: 'r9',
    }),
  );
  expect(useProgress.getState().error).toMatch(/changed on disk/);
});

test('a file TBCE cannot use is never written over', async () => {
  useWorkspace.setState({ workspace });
  useProgress.setState({
    detection: { status: 'invalid', message: 'bad' },
    loaded: true,
  });

  expect(await actions.save(plan)).toBe(false);

  expect(progress.write).not.toHaveBeenCalled();
});

test('an answer for a replaced folder is discarded', async () => {
  useWorkspace.setState({ workspace });
  let answer: (value: { status: 'none' }) => void = () => {};
  vi.mocked(progress.read).mockReturnValue(
    new Promise((resolve) => (answer = resolve)),
  );

  const pending = actions.load();
  useWorkspace.setState({
    workspace: { id: '2', name: 'other', path: 'C:/code/other' },
  });
  answer({ status: 'none' });

  expect(await pending).toBe(false);
  expect(useProgress.getState().loaded).toBe(false);
});
