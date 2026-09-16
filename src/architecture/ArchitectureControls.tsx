import { useEffect } from 'react';
import { architectureActions, useArchitectures } from '../stores/architecture';
import type { StructureEntry } from '../types/architecture';

export function ArchitectureSelect({
  value,
  onChange,
  disabled = false,
  metadata = false,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  metadata?: boolean;
}) {
  const { architectures, loaded, error, warnings } = useArchitectures();
  useEffect(() => {
    void architectureActions.load();
  }, []);
  const known = architectures.find((a) => a.id === value);
  return (
    <div className="architecture-selection">
      <label className="field">
        <span>Architecture</span>
        <select
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">No architecture</option>
          {value && !known && (
            <option value={value}>{value} (unavailable)</option>
          )}
          {architectures.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {value && !known && loaded && (
        <p className="field-note">
          This saved value is unavailable. It is retained as metadata; no
          structure will be generated.
        </p>
      )}
      {known && <p className="field-note">{known.description}</p>}
      {known?.boundaries && (
        <p className="architecture-boundaries">{known.boundaries}</p>
      )}
      {metadata && (
        <p className="field-note">
          This changes metadata only. Structures are generated when creating new
          projects.
        </p>
      )}
      {error && (
        <p role="alert" className="stack-error">
          {error}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="stack-error">
          {w}
        </p>
      ))}
    </div>
  );
}

export function StructureTree({ entries }: { entries: StructureEntry[] }) {
  const tree = new Map<string, boolean>();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    for (let i = 1; i < parts.length; i++)
      tree.set(parts.slice(0, i).join('/'), true);
    tree.set(entry.path, entry.directory);
  }
  return (
    <ul className="structure-tree" aria-label="Folder structure">
      {[...tree]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, directory]) => (
          <li
            key={path}
            style={{ paddingLeft: `${(path.split('/').length - 1) * 16}px` }}
            title={path}
          >
            <span aria-hidden="true">{directory ? '▸ ' : '· '}</span>
            {path.split('/').pop()}
            {directory ? '/' : ''}
          </li>
        ))}
      {!entries.length && (
        <li className="muted">No starter files or folders.</li>
      )}
    </ul>
  );
}
