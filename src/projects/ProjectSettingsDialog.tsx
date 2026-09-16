import { useEffect, useRef, useState } from 'react';
import { actions, useProject } from '../stores/project';
import type { ProjectFields } from '../types/project';
import { stackActions, useStacks } from '../stores/stack';
import { ArchitectureSelect } from '../architecture/ArchitectureControls';
const COMMANDS = ['install', 'dev', 'build', 'test'] as const;
const trimmed = (value: string) => value.trim() || null;
export function ProjectSettingsDialog({
  mode,
  initial,
  onClose,
}: {
  mode: 'convert' | 'settings';
  initial: ProjectFields;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const busy = useProject((s) => s.busy);
  const [fields, setFields] = useState(initial);
  const stacks = useStacks((s) => s.stacks);
  useEffect(() => {
    void stackActions.load();
  }, []);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  const text = (
    label: string,
    value: string | null | undefined,
    change: (value: string | null) => void,
  ) => (
    <label className="field" key={label}>
      <span>{label}</span>
      <input
        value={value ?? ''}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
      />
    </label>
  );
  const submit = async () => {
    if (!fields.name.trim()) return;
    const normalized: ProjectFields = {
      ...fields,
      name: fields.name.trim(),
      stack: trimmed(fields.stack ?? ''),
      architecture: trimmed(fields.architecture ?? ''),
      defaultBranch: trimmed(fields.defaultBranch ?? ''),
      commands: Object.fromEntries(
        COMMANDS.map((key) => [key, trimmed(fields.commands[key] ?? '')]),
      ),
    };
    if (await actions.saveFields(normalized)) onClose();
  };
  return (
    <dialog
      ref={ref}
      className="modal"
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
        <span className="eyebrow">TBCE PROJECT</span>
        <h2>
          {mode === 'convert' ? 'Convert to project' : 'Project settings'}
        </h2>
        <p>
          {mode === 'convert'
            ? 'This writes .tbce/project.json so TBCE recognizes this folder as a project.'
            : 'These values are stored in .tbce/project.json.'}
        </p>
        <div className="field-grid">
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={fields.name}
              disabled={busy}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Stack</span>
            <input
              list="saved-stack-options"
              disabled={busy}
              value={fields.stack ?? ''}
              onChange={(e) => setFields({ ...fields, stack: e.target.value })}
            />
            <datalist id="saved-stack-options">
              {stacks.map((stack) => (
                <option key={stack.id} value={stack.id}>
                  {stack.name}
                </option>
              ))}
            </datalist>
          </label>
          <ArchitectureSelect
            value={fields.architecture}
            disabled={busy}
            metadata
            onChange={(architecture) => setFields({ ...fields, architecture })}
          />
          {text('Default branch', fields.defaultBranch, (defaultBranch) =>
            setFields({ ...fields, defaultBranch }),
          )}
        </div>
        <span className="field-legend">COMMANDS</span>
        <div className="field-grid">
          {COMMANDS.map((key) =>
            text(
              key[0].toUpperCase() + key.slice(1),
              fields.commands[key],
              (value) =>
                setFields({
                  ...fields,
                  commands: { ...fields.commands, [key]: value },
                }),
            ),
          )}
        </div>
        <p className="field-note">
          Commands are stored for later milestones. TBCE does not run them yet.
        </p>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || !fields.name.trim()}
          >
            {mode === 'convert' ? 'Create project file' : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
