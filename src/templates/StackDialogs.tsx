import { useEffect, useRef, useState, type ReactNode } from 'react';
import { templates } from '../services/templates';
import { stackActions, useStacks } from '../stores/stack';
import { actions as workspaceActions, useWorkspace } from '../stores/workspace';
import { useProject } from '../stores/project';
import { emptyFields, fieldsOf, type ProjectFields } from '../types/project';
import type { SourceEntry, Stack, StackFields } from '../types/stack';
import {
  ArchitectureSelect,
  StructureTree,
} from '../architecture/ArchitectureControls';
import { useArchitectures } from '../stores/architecture';
import { architectures } from '../services/architecture';
import type { StructurePreview } from '../types/architecture';

export function StackModal({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal stack-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

export function DefaultFields({
  fields,
  change,
  disabled,
  metadata = true,
}: {
  fields: ProjectFields;
  change: (fields: ProjectFields) => void;
  disabled: boolean;
  metadata?: boolean;
}) {
  return (
    <>
      <div className="field-grid">
        <ArchitectureSelect
          value={fields.architecture}
          disabled={disabled}
          metadata={metadata}
          onChange={(architecture) => change({ ...fields, architecture })}
        />
        <label className="field">
          <span>Default branch</span>
          <input
            disabled={disabled}
            value={fields.defaultBranch ?? ''}
            onChange={(e) =>
              change({ ...fields, defaultBranch: e.target.value || null })
            }
          />
        </label>
      </div>
      <span className="field-legend">COMMAND DEFAULTS</span>
      <div className="field-grid">
        {(['install', 'dev', 'build', 'test'] as const).map((key) => (
          <label className="field" key={key}>
            <span>{key[0].toUpperCase() + key.slice(1)}</span>
            <input
              disabled={disabled}
              value={fields.commands[key] ?? ''}
              onChange={(e) =>
                change({
                  ...fields,
                  commands: {
                    ...fields.commands,
                    [key]: e.target.value || null,
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      <p className="field-note">
        Commands are saved as defaults. Run them yourself in the terminal when
        needed.
      </p>
    </>
  );
}

export function NewProjectDialog({
  initialStackId = '',
  onClose,
}: {
  initialStackId?: string;
  onClose: () => void;
}) {
  const { stacks, busy, error } = useStacks();
  const initial = stacks.find((s) => s.id === initialStackId);
  const [stackId, setStackId] = useState(initialStackId);
  const [fields, setFields] = useState<ProjectFields>({
    ...(initial?.defaults ?? emptyFields('')),
    name: '',
  });
  const catalog = useArchitectures();
  const architectureId =
    catalog.architectures.find((a) => a.id === fields.architecture)?.id ?? null;
  const previewKey = JSON.stringify([stackId, architectureId]);
  const [preview, setPreview] = useState<{
    key: string;
    result?: StructurePreview;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (catalog.loaded && !catalog.busy && !catalog.error) {
      void architectures
        .preview(stackId || null, architectureId)
        .then((result) => {
          if (active) setPreview({ key: previewKey, result });
        })
        .catch((e: unknown) => {
          if (active)
            setPreview({
              key: previewKey,
              error: (e as { message?: string })?.message || String(e),
            });
        });
    }
    return () => {
      active = false;
    };
  }, [
    stackId,
    architectureId,
    previewKey,
    catalog.loaded,
    catalog.busy,
    catalog.error,
  ]);
  const currentPreview = preview?.key === previewKey ? preview : null;
  const ready =
    catalog.loaded &&
    !catalog.busy &&
    !catalog.error &&
    !!currentPreview?.result &&
    !currentPreview.result.conflicts.length;
  useEffect(() => {
    void stackActions.load();
  }, []);
  return (
    <StackModal title="New project" busy={busy} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || busy) return;
          void stackActions
            .create(
              stackId || null,
              { ...fields, name: fields.name.trim() },
              architectureId,
            )
            .then((ok) => {
              if (ok) onClose();
            });
        }}
      >
        <label className="field">
          <span>Stack</span>
          <select
            disabled={busy}
            value={stackId}
            onChange={(e) => {
              const id = e.target.value;
              setStackId(id);
              setFields({
                ...(stacks.find((s) => s.id === id)?.defaults ??
                  emptyFields('')),
                name: fields.name,
              });
            }}
          >
            <option value="">Blank project</option>
            {stacks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {stacks.length === 0 && !busy && (
          <p className="field-note">
            Your library is empty. Open a project and save it as a stack to
            reuse it here.
          </p>
        )}
        {stackId && <p>{stacks.find((s) => s.id === stackId)?.description}</p>}
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            required
            disabled={busy}
            value={fields.name}
            onChange={(e) => setFields({ ...fields, name: e.target.value })}
          />
        </label>
        <p className="field-note">
          A new folder with this name will be created inside the location you
          choose. Files keep their original contents and package names.
        </p>
        <DefaultFields
          fields={fields}
          change={setFields}
          disabled={busy}
          metadata={false}
        />
        {currentPreview?.result && (
          <>
            <span className="field-legend">PROJECT STRUCTURE</span>
            <StructureTree entries={currentPreview.result.entries} />
            <p className="field-note">
              A fresh .tbce/project.json is also created.
            </p>
            {currentPreview.result.conflicts.length > 0 && (
              <div role="alert" className="stack-error">
                <p>
                  Resolve these path conflicts by editing the architecture or
                  choosing a different stack or architecture:
                </p>
                <ul>
                  {currentPreview.result.conflicts.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {currentPreview?.error && (
          <p role="alert" className="stack-error">
            {currentPreview.error}
          </p>
        )}
        {!currentPreview && !catalog.error && (
          <p role="status">Loading structure preview…</p>
        )}
        {error && (
          <p className="stack-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !ready || !fields.name.trim()}
          >
            {busy ? 'Working…' : 'Choose location'}
          </button>
        </div>
      </form>
    </StackModal>
  );
}

export function SaveStackDialog({
  stack,
  editing = false,
  onClose,
}: {
  stack?: Stack;
  editing?: boolean;
  onClose: () => void;
}) {
  const workspace = useWorkspace((s) => s.workspace);
  const project = useProject((s) => s.project);
  const workspaceError = useWorkspace((s) => s.error);
  const { busy, error } = useStacks();
  const [fields, setFields] = useState<StackFields>(() => ({
    name: stack?.name ?? workspace?.name ?? '',
    description: stack?.description ?? '',
    languages: stack?.languages ?? [],
    frameworks: stack?.frameworks ?? [],
    defaults:
      editing && stack
        ? stack.defaults
        : project
          ? fieldsOf(project.manifest)
          : emptyFields(workspace?.name ?? ''),
  }));
  const [languages, setLanguages] = useState(fields.languages.join(', '));
  const [frameworks, setFrameworks] = useState(fields.frameworks.join(', '));
  const [entries, setEntries] = useState<SourceEntry[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const loaded = useRef(new Set<string>());
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(editing);
  const [localError, setLocalError] = useState<string | null>(null);
  const sourceId = useRef(workspace?.id);
  const initialized = useRef(false);

  // Selected directories are fully enumerated; excluded trees are loaded only on demand.
  async function collect(
    id: string,
    path: string,
    force = false,
  ): Promise<SourceEntry[]> {
    const children = await templates.inspect(id, path);
    loaded.current.add(path);
    const result: SourceEntry[] = [];
    for (const child of children) {
      const entry = {
        ...child,
        selected: !child.blocked && (force || child.selected),
      };
      result.push(entry);
      if (entry.directory && entry.selected)
        result.push(...(await collect(id, entry.path, force)));
    }
    return result;
  }
  async function refresh() {
    setLoading(true);
    setReady(false);
    setLocalError(null);
    loaded.current.clear();
    const ok = await workspaceActions.snapshot(async (id) => {
      if (id !== sourceId.current)
        throw new Error('The workspace changed. Reopen this dialog.');
      setEntries(await collect(id, ''));
      setExpanded([]);
    });
    setReady(ok);
    setLoading(false);
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (!editing) void refresh();
    // Capture the source once; a workspace change must not retarget the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function expand(entry: SourceEntry, select = false) {
    if (!sourceId.current) return;
    setLoading(true);
    setLocalError(null);
    try {
      if (select || !loaded.current.has(entry.path)) {
        const children = await collect(sourceId.current, entry.path, select);
        setEntries((old) =>
          [
            ...old.filter((e) => !e.path.startsWith(entry.path + '/')),
            ...children,
          ].sort((a, b) => a.path.localeCompare(b.path)),
        );
      }
      setExpanded((old) =>
        old.includes(entry.path) ? old : [...old, entry.path],
      );
    } catch (e) {
      setLocalError((e as Error).message);
      setReady(false);
    } finally {
      setLoading(false);
    }
  }
  function toggle(entry: SourceEntry, selected: boolean) {
    setEntries((old) =>
      old.map((e) =>
        e.path === entry.path || e.path.startsWith(entry.path + '/')
          ? { ...e, selected: selected && !e.blocked }
          : e,
      ),
    );
    if (entry.directory && selected) void expand(entry, true);
  }
  const selected = entries.filter((e) => e.selected && !e.blocked);
  const disabled = busy || loading;
  const title = editing
    ? 'Edit stack details'
    : stack
      ? 'Replace saved stack'
      : 'Save current project as stack';
  function tree(parent: string): ReactNode {
    return entries
      .filter(
        (e) => e.path.slice(0, Math.max(0, e.path.lastIndexOf('/'))) === parent,
      )
      .map((entry) => (
        <div key={entry.path} className="stack-tree-node">
          <div className="stack-file-row">
            {entry.directory ? (
              <button
                type="button"
                className="icon-button"
                disabled={disabled || !!entry.blocked}
                aria-label={`${expanded.includes(entry.path) ? 'Collapse' : 'Expand'} ${entry.path}`}
                onClick={() => {
                  if (expanded.includes(entry.path))
                    setExpanded((old) => old.filter((p) => p !== entry.path));
                  else void expand(entry);
                }}
              >
                {expanded.includes(entry.path) ? '▾' : '▸'}
              </button>
            ) : (
              <span className="tree-indent" />
            )}
            <label title={entry.blocked ?? entry.path}>
              <input
                type="checkbox"
                disabled={disabled || !!entry.blocked}
                checked={entry.selected}
                onChange={(e) => toggle(entry, e.target.checked)}
              />
              <span>
                {entry.path.split('/').pop()}
                {entry.directory ? '/' : ''}
              </span>
            </label>
            <span className="muted">
              {entry.blocked
                ? 'Unavailable'
                : entry.directory
                  ? ''
                  : `${entry.size.toLocaleString()} B`}
            </span>
          </div>
          {entry.directory && expanded.includes(entry.path) && (
            <div className="stack-tree-children">{tree(entry.path)}</div>
          )}
        </div>
      ));
  }
  return (
    <StackModal title={title} busy={disabled} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const normalized = {
            ...fields,
            languages: languages.split(','),
            frameworks: frameworks.split(','),
          };
          const saving =
            editing && stack
              ? stackActions.edit(stack.id, normalized)
              : stackActions.save(
                  sourceId.current!,
                  stack?.id ?? null,
                  normalized,
                  selected,
                );
          void saving.then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <div className="field-grid">
          <label className="field">
            <span>Stack name</span>
            <input
              autoFocus
              required
              disabled={disabled}
              value={fields.name}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <input
              disabled={disabled}
              value={fields.description}
              onChange={(e) =>
                setFields({ ...fields, description: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Languages (comma separated)</span>
            <input
              disabled={disabled}
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Frameworks (comma separated)</span>
            <input
              disabled={disabled}
              value={frameworks}
              onChange={(e) => setFrameworks(e.target.value)}
            />
          </label>
        </div>
        <DefaultFields
          fields={fields.defaults}
          change={(defaults) => setFields({ ...fields, defaults })}
          disabled={disabled}
        />
        {!editing && (
          <>
            <div className="stack-selection-heading">
              <span className="field-legend">FILES TO SAVE</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void refresh()}
              >
                Refresh file list
              </button>
            </div>
            <p className="field-note">
              Git history and TBCE metadata are omitted. Dependencies, build
              output, caches, and local environment files start unchecked.
              Review your selection before saving. Refresh resets the selection.
            </p>
            <div className="stack-file-tree" aria-label="Stack files">
              {tree('')}
              {loading && <p role="status">Reading files…</p>}
              {ready && entries.length === 0 && (
                <p>
                  No eligible files. You can save command defaults as an empty
                  stack.
                </p>
              )}
            </div>
            <p className="field-note">
              {selected.filter((e) => !e.directory).length} files ·{' '}
              {selected.reduce((sum, e) => sum + e.size, 0).toLocaleString()}{' '}
              bytes selected
            </p>
          </>
        )}
        {(localError || error || workspaceError) && (
          <p className="stack-error" role="alert">
            {localError || error || workspaceError}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={disabled} onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={disabled || !ready || !fields.name.trim()}
          >
            {busy
              ? 'Saving…'
              : editing
                ? 'Save details'
                : stack
                  ? 'Replace snapshot'
                  : 'Save stack'}
          </button>
        </div>
      </form>
    </StackModal>
  );
}
