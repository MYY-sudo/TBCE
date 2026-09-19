import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { actions, useProgress } from '../stores/progress';
import { actions as githubActions, useGitHub } from '../stores/github';
import {
  LIMITS,
  newId,
  normalizePlan,
  planProblem,
  type ProgressArea,
  type ProgressPlan,
  type ProgressTask,
} from '../types/progress';
const blank = (): ProgressArea => ({
  id: newId(),
  name: '',
  label: null,
  milestone: null,
  tasks: [],
});
/// A plan to edit. An empty one starts with a blank area to fill in.
const copy = (plan: ProgressPlan): ProgressPlan => ({
  areas: plan.areas.length
    ? plan.areas.map((area) => ({
        ...area,
        tasks: area.tasks.map((task) => ({ ...task })),
      }))
    : [blank()],
});
/// Areas and their tasks, edited together and saved in one write.
export function ProgressDialog({
  plan,
  revision,
  connected,
  onClose,
}: {
  plan: ProgressPlan;
  revision: string | null;
  connected: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const busy = useProgress((s) => s.busy);
  const error = useProgress((s) => s.error);
  const choices = useGitHub((s) => s.choices);
  const [draft, setDraft] = useState(() => copy(plan));
  // A save refused because the file changed reloads the plan; the edits start again from it.
  const [base, setBase] = useState(revision);
  if (base !== revision) {
    setBase(revision);
    setDraft(copy(plan));
  }
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    if (connected) void githubActions.loadChoices();
  }, [connected]);
  const problem = planProblem(draft);
  const areas = draft.areas;
  const change = (index: number, changes: Partial<ProgressArea>) =>
    setDraft({
      areas: areas.map((area, at) =>
        at === index ? { ...area, ...changes } : area,
      ),
    });
  const move = (index: number, by: number) => {
    const next = [...areas];
    const [area] = next.splice(index, 1);
    next.splice(index + by, 0, area);
    setDraft({ areas: next });
  };
  const changeTask = (
    index: number,
    taskIndex: number,
    changes: Partial<ProgressTask>,
  ) =>
    change(index, {
      tasks: areas[index].tasks.map((task, at) =>
        at === taskIndex ? { ...task, ...changes } : task,
      ),
    });
  const submit = async () => {
    if (problem) return;
    if (await actions.save(normalizePlan(draft))) onClose();
  };
  return (
    <dialog
      ref={ref}
      className="modal progress-modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="eyebrow">PROJECT PROGRESS</span>
        <h2>Edit areas</h2>
        <p>
          Stored in .tbce/progress.json. An area's issues are those carrying its
          GitHub label and those in its milestone; pull requests are left out.
        </p>
        {choices && (
          <datalist id="progress-label-options">
            {choices.labels.map((label) => (
              <option key={label.name} value={label.name} />
            ))}
          </datalist>
        )}
        <div className="progress-edit">
          {areas.map((area, index) => {
            const known = choices?.milestones.some(
              (milestone) => milestone.number === area.milestone,
            );
            const name = area.name.trim() || `Area ${index + 1}`;
            return (
              <fieldset
                className="progress-edit-area"
                key={area.id}
                aria-label={name}
              >
                <div className="progress-edit-row">
                  <input
                    aria-label="Area name"
                    placeholder="Area name"
                    value={area.name}
                    disabled={busy}
                    maxLength={LIMITS.name}
                    onChange={(e) => change(index, { name: e.target.value })}
                  />
                  <button
                    type="button"
                    aria-label={`Move ${name} up`}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${name} down`}
                    disabled={busy || index === areas.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    aria-label={`Remove ${name}`}
                    disabled={busy}
                    onClick={() =>
                      setDraft({ areas: areas.filter((_, at) => at !== index) })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>GitHub label</span>
                    <input
                      list="progress-label-options"
                      value={area.label ?? ''}
                      disabled={busy}
                      maxLength={LIMITS.label}
                      onChange={(e) =>
                        change(index, { label: e.target.value || null })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>GitHub milestone</span>
                    {choices ? (
                      <select
                        value={area.milestone ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          change(index, {
                            milestone: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      >
                        <option value="">None</option>
                        {choices.milestones.map((milestone) => (
                          <option
                            key={milestone.number}
                            value={milestone.number}
                          >
                            {milestone.title}
                          </option>
                        ))}
                        {area.milestone !== null && !known && (
                          <option value={area.milestone}>
                            #{area.milestone}
                          </option>
                        )}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        placeholder="Number"
                        value={area.milestone ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          change(index, {
                            milestone: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                      />
                    )}
                  </label>
                </div>
                <span className="field-legend">TASKS</span>
                {area.tasks.map((task, taskIndex) => (
                  <div className="progress-edit-row" key={task.id}>
                    <input
                      type="checkbox"
                      aria-label={`${task.title.trim() || 'Task'} done`}
                      checked={task.done}
                      disabled={busy}
                      onChange={(e) =>
                        changeTask(index, taskIndex, { done: e.target.checked })
                      }
                    />
                    <input
                      aria-label="Task title"
                      placeholder="Task"
                      value={task.title}
                      disabled={busy}
                      maxLength={LIMITS.title}
                      onChange={(e) =>
                        changeTask(index, taskIndex, { title: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="danger"
                      aria-label={`Remove task ${task.title.trim() || taskIndex + 1}`}
                      disabled={busy}
                      onClick={() =>
                        change(index, {
                          tasks: area.tasks.filter((_, at) => at !== taskIndex),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="link-button"
                  disabled={busy || area.tasks.length >= LIMITS.tasks}
                  onClick={() =>
                    change(index, {
                      tasks: [
                        ...area.tasks,
                        { id: newId(), title: '', done: false },
                      ],
                    })
                  }
                >
                  <Plus size={12} /> Add task to {name}
                </button>
              </fieldset>
            );
          })}
        </div>
        <button
          type="button"
          className="link-button"
          disabled={busy || areas.length >= LIMITS.areas}
          onClick={() => setDraft({ areas: [...areas, blank()] })}
        >
          <Plus size={12} /> Add area
        </button>
        {problem && (
          <p className="project-warning" role="alert">
            {problem}
          </p>
        )}
        {error && !problem && (
          <p className="project-warning" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !!problem}
          >
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
