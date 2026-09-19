import type { GitHubAreaIssue, GitHubAreaIssues } from './github';
/// A piece of work inside an area, ticked when it is done.
export interface ProgressTask {
  id: string;
  title: string;
  done: boolean;
}
/// An area of the project. Its issues are those carrying `label` and those in `milestone`.
export interface ProgressArea {
  id: string;
  name: string;
  label: string | null;
  milestone: number | null;
  tasks: ProgressTask[];
}
export interface ProgressPlan {
  areas: ProgressArea[];
}
export interface Progress {
  plan: ProgressPlan;
  revision: string;
}
/// What `.tbce/progress.json` holds. A file TBCE cannot use is reported and never overwritten.
export type ProgressDetection =
  | { status: 'none' }
  | { status: 'found'; plan: ProgressPlan; revision: string }
  | { status: 'invalid'; message: string };
/// The limits the backend enforces, checked here too so the dialog can say what is wrong first.
export const LIMITS = {
  areas: 50,
  tasks: 200,
  name: 100,
  title: 200,
  label: 50,
} as const;
export const newId = () => crypto.randomUUID();
export const isMapped = (area: ProgressArea) =>
  Boolean(area.label?.trim()) || area.milestone !== null;
/// Which read an area's issues come from. Areas with the same label and milestone share one.
export const mappingKey = (area: ProgressArea): string | null =>
  isMapped(area) ? `${area.label?.trim() ?? ''}#${area.milestone ?? ''}` : null;
export interface Figures {
  tasksDone: number;
  tasks: number;
  /// Closed issues that count as done: everything closed except what was closed as not planned.
  issuesClosed: number;
  /// Issues that count, which leaves out the ones closed as not planned.
  issues: number;
  notPlanned: number;
  done: number;
  total: number;
  /// 0 to 100, or null when there is nothing to measure.
  percent: number | null;
  /// Some mapped issues could not be read, so the figures stand for tasks alone.
  issuesMissing: boolean;
  truncated: boolean;
}
function figures(
  tasks: ProgressTask[],
  issues: GitHubAreaIssue[],
  issuesMissing: boolean,
  truncated: boolean,
): Figures {
  const tasksDone = tasks.filter((task) => task.done).length;
  const counted = issues.filter((issue) => !issue.notPlanned);
  const issuesClosed = counted.filter(
    (issue) => issue.state === 'closed',
  ).length;
  const done = tasksDone + issuesClosed;
  const total = tasks.length + counted.length;
  return {
    tasksDone,
    tasks: tasks.length,
    issuesClosed,
    issues: counted.length,
    notPlanned: issues.length - counted.length,
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : null,
    issuesMissing,
    truncated,
  };
}
/// One area: its tasks plus its issues, when they could be read. Commits are never counted.
export const areaProgress = (
  area: ProgressArea,
  issues: GitHubAreaIssues | null,
): Figures =>
  figures(
    area.tasks,
    issues?.issues ?? [],
    isMapped(area) && !issues,
    issues?.truncated ?? false,
  );
/// The whole project. An issue that belongs to two areas is counted once here.
export const projectProgress = (
  areas: ProgressArea[],
  issuesOf: (area: ProgressArea) => GitHubAreaIssues | null,
): Figures => {
  const issues = new Map<number, GitHubAreaIssue>();
  let missing = false;
  let truncated = false;
  for (const area of areas) {
    const read = issuesOf(area);
    if (isMapped(area) && !read) missing = true;
    if (read?.truncated) truncated = true;
    for (const issue of read?.issues ?? []) issues.set(issue.number, issue);
  }
  return figures(
    areas.flatMap((area) => area.tasks),
    [...issues.values()],
    missing,
    truncated,
  );
};
const control = /\p{Cc}/u;
const length = (value: string) => [...value].length;
/// The first thing the backend would refuse about this plan, or null.
export function planProblem(plan: ProgressPlan): string | null {
  if (plan.areas.length > LIMITS.areas)
    return `A project has at most ${LIMITS.areas} areas.`;
  const names = new Set<string>();
  for (const area of plan.areas) {
    const name = area.name.trim();
    if (!name) return 'Enter a name for every area.';
    if (length(name) > LIMITS.name)
      return `"${name}" is longer than ${LIMITS.name} characters.`;
    if (control.test(name)) return `"${name}" contains a control character.`;
    if (names.has(name.toLowerCase()))
      return `There are two areas named "${name}".`;
    names.add(name.toLowerCase());
    const label = area.label?.trim() ?? '';
    if (
      length(label) > LIMITS.label ||
      control.test(label) ||
      label.includes(',')
    )
      return `${name}: labels have at most ${LIMITS.label} characters and no commas.`;
    if (
      area.milestone !== null &&
      (!Number.isInteger(area.milestone) || area.milestone < 1)
    )
      return `${name}: that milestone cannot be used.`;
    if (area.tasks.length > LIMITS.tasks)
      return `${name}: an area has at most ${LIMITS.tasks} tasks.`;
    for (const task of area.tasks) {
      const title = task.title.trim();
      if (!title) return `${name}: enter a title for every task.`;
      if (length(title) > LIMITS.title)
        return `${name}: "${title}" is longer than ${LIMITS.title} characters.`;
      if (control.test(title))
        return `${name}: "${title}" contains a control character.`;
    }
  }
  return null;
}
/// The plan as it is sent: names, titles and labels trimmed, and a blank label dropped.
export const normalizePlan = (plan: ProgressPlan): ProgressPlan => ({
  areas: plan.areas.map((area) => ({
    ...area,
    name: area.name.trim(),
    label: area.label?.trim() || null,
    tasks: area.tasks.map((task) => ({ ...task, title: task.title.trim() })),
  })),
});
