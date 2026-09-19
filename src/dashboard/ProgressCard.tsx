import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../stores/workspace';
import { useProject } from '../stores/project';
import { useGitHub } from '../stores/github';
import {
  actions as dashboardActions,
  useDashboard,
  type AreaRead,
} from '../stores/dashboard';
import { actions, useProgress } from '../stores/progress';
import { ProjectSettingsDialog } from '../projects/ProjectSettingsDialog';
import { ProgressDialog } from './ProgressDialog';
import { emptyFields } from '../types/project';
import {
  areaProgress,
  mappingKey,
  projectProgress,
  type Figures,
  type ProgressArea,
} from '../types/progress';
/// Issues listed under an opened area. The rest are counted, and the Issues tab lists them all.
const ISSUES_SHOWN = 30;
function Bar({ label, percent }: { label: string; percent: number | null }) {
  return (
    <div
      className="dashboard-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? 0}
    >
      <span style={{ width: `${percent ?? 0}%` }} />
    </div>
  );
}
const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;
/// "3 of 5 tasks · 7 of 10 issues", saying what was left out and why.
function summary(
  figures: Figures,
  mapped: boolean,
  issuesNote: string | null,
): string {
  const parts = [
    `${figures.tasksDone} of ${plural(figures.tasks, 'task', 'tasks')}`,
  ];
  if (mapped && !figures.issuesMissing) {
    parts.push(
      `${figures.issuesClosed} of ${plural(figures.issues, 'issue', 'issues')}`,
    );
    if (figures.notPlanned)
      parts.push(`${figures.notPlanned} not planned, left out`);
    if (figures.truncated) parts.push('first 500 per label or milestone read');
  }
  if (mapped && figures.issuesMissing && issuesNote) parts.push(issuesNote);
  return parts.join(' · ');
}
export function ProgressCard({
  unavailable,
}: {
  /// Why GitHub cannot be asked about mapped issues, or null when it can.
  unavailable: string | null;
}) {
  const workspace = useWorkspace((s) => s.workspace);
  const project = useProject((s) => s.project);
  const projectDetection = useProject((s) => s.detection);
  const { detection, loaded, busy, error } = useProgress();
  const reads = useDashboard((s) => s.areas);
  const areasBusy = useDashboard((s) => s.areasBusy);
  const openMilestones = useDashboard((s) => s.milestones);
  const choices = useGitHub((s) => s.choices);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const isProject = Boolean(project);
  useEffect(() => {
    if (isProject) void actions.load();
  }, [isProject, workspace?.id]);
  const areas = detection.status === 'found' ? detection.plan.areas : [];
  // Mapped issues are read again only when a label or milestone changes, not when a task is ticked.
  const keys = [...new Set(areas.map(mappingKey).filter((key) => key !== null))]
    .sort()
    .join('\n');
  const connected = unavailable === null;
  useEffect(() => {
    if (connected && keys) void dashboardActions.refreshAreas();
  }, [connected, keys, workspace?.id]);
  const readOf = (area: ProgressArea): AreaRead | undefined => {
    const key = mappingKey(area);
    return key ? reads[key] : undefined;
  };
  const issuesOf = (area: ProgressArea) =>
    connected ? (readOf(area)?.value ?? null) : null;
  /// Why an area's issues are not in its figures.
  const issuesNote = (area: ProgressArea): string | null => {
    if (!connected) return `issues not counted: ${unavailable}`;
    const read = readOf(area);
    if (read?.denied) return 'this token cannot read issues';
    if (read?.error) return `issues unavailable: ${read.error}`;
    return areasBusy ? 'reading issues…' : null;
  };
  const milestoneName = (number: number) =>
    openMilestones.find((milestone) => milestone.number === number)?.title ??
    choices?.milestones.find((milestone) => milestone.number === number)
      ?.title ??
    `#${number}`;
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };
  if (projectDetection.status === 'invalid')
    return (
      <p className="muted github-empty">
        progress.json sits beside project.json, which cannot be read, so
        progress is not shown.
      </p>
    );
  if (!project)
    return (
      <>
        <p className="muted github-empty">
          Progress is kept in the project's .tbce folder. Convert this folder to
          a TBCE project to track it.
        </p>
        <button className="link-button" onClick={() => setConverting(true)}>
          Convert to project
        </button>
        {converting && workspace && (
          <ProjectSettingsDialog
            mode="convert"
            initial={emptyFields(workspace.name)}
            onClose={() => setConverting(false)}
          />
        )}
      </>
    );
  const overall = projectProgress(areas, issuesOf);
  return (
    <>
      {error && (
        <p className="project-warning" role="alert">
          {error}{' '}
          <button className="link-button" onClick={actions.dismissError}>
            Dismiss
          </button>
        </p>
      )}
      {!loaded ? (
        <p className="muted github-empty">Reading…</p>
      ) : detection.status === 'invalid' ? (
        <p className="project-warning" role="status">
          {detection.message} Fix or remove .tbce/progress.json to edit progress
          here; TBCE never overwrites it.
        </p>
      ) : !areas.length ? (
        <>
          <p className="muted github-empty">
            No areas yet. Divide the project into areas such as Authentication
            or Teams, list the tasks in each, and map a GitHub label or
            milestone to count its issues too. Commits are never counted.
          </p>
          <button
            className="link-button"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Add areas
          </button>
        </>
      ) : (
        <>
          <p className="dashboard-figure">
            <strong>
              {overall.percent === null ? '—' : `${overall.percent}%`}
            </strong>{' '}
            {overall.total
              ? `${overall.done} of ${overall.total} done`
              : 'nothing to measure yet'}
          </p>
          <Bar label="Project progress" percent={overall.percent} />
          {overall.issuesMissing && (
            <p className="github-meta">
              Areas whose issues could not be read count their tasks alone.
            </p>
          )}
          <div className="progress-areas">
            {areas.map((area) => {
              const figures = areaProgress(area, issuesOf(area));
              const open = expanded.has(area.id);
              const issues = issuesOf(area)?.issues ?? [];
              const mapping = [
                area.label ? `label ${area.label}` : null,
                area.milestone !== null
                  ? `milestone ${milestoneName(area.milestone)}`
                  : null,
              ].filter(Boolean);
              return (
                <div className="progress-area" key={area.id}>
                  <div className="github-row">
                    <button
                      className="progress-toggle"
                      aria-expanded={open}
                      onClick={() => toggle(area.id)}
                    >
                      {open ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                      <span className="github-value" title={area.name}>
                        {area.name}
                      </span>
                    </button>
                    <span className="github-meta">
                      {figures.percent === null
                        ? 'nothing to measure'
                        : `${figures.percent}%`}
                    </span>
                  </div>
                  <Bar
                    label={`${area.name} progress`}
                    percent={figures.percent}
                  />
                  <p className="github-meta">
                    {summary(figures, mapping.length > 0, issuesNote(area))}
                  </p>
                  {open && (
                    <div className="progress-detail">
                      {mapping.length > 0 && (
                        <p className="github-meta">
                          Issues from {mapping.join(' and ')}.
                        </p>
                      )}
                      {!area.tasks.length ? (
                        <p className="muted github-empty">No tasks.</p>
                      ) : (
                        area.tasks.map((task) => (
                          <label className="progress-task" key={task.id}>
                            <input
                              type="checkbox"
                              checked={task.done}
                              disabled={busy}
                              onChange={() =>
                                void actions.toggleTask(area.id, task.id)
                              }
                            />
                            <span>{task.title}</span>
                          </label>
                        ))
                      )}
                      {issues.slice(0, ISSUES_SHOWN).map((issue) => (
                        <div className="github-row" key={issue.number}>
                          <span className="github-oid">#{issue.number}</span>
                          <span className="github-value" title={issue.title}>
                            {issue.title}
                          </span>
                          <span className="github-meta">
                            {issue.notPlanned ? 'not planned' : issue.state}
                          </span>
                        </div>
                      ))}
                      {issues.length > ISSUES_SHOWN && (
                        <p className="github-meta">
                          {issues.length - ISSUES_SHOWN} more issues are
                          counted; the Issues tab lists them.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            className="link-button"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Edit areas
          </button>
        </>
      )}
      <p className="github-meta">
        Kept in .tbce/progress.json. Tasks count as done when ticked, issues
        when closed; commits are never counted.
      </p>
      {editing && detection.status !== 'invalid' && (
        <ProgressDialog
          plan={detection.status === 'found' ? detection.plan : { areas: [] }}
          revision={detection.status === 'found' ? detection.revision : null}
          connected={connected}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
