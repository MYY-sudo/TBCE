import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Settings2,
  Trash2,
  Ban,
} from 'lucide-react';
import { actions, useWorkspace } from '../stores/workspace';
import { useProject } from '../stores/project';
import { useGit } from '../stores/git';
import { ProjectSettingsDialog } from '../projects/ProjectSettingsDialog';
import { emptyFields, fieldsOf } from '../types/project';
import { headLabel } from '../types/git';
import type { FileEntry } from '../types/workspace';
function Tree({ path, depth }: { path: string; depth: number }) {
  const entries = useWorkspace((s) => s.tree[path]);
  return (
    <div role="group">
      {entries?.map((entry) => (
        <Row key={entry.path} entry={entry} depth={depth} />
      ))}
    </div>
  );
}
function Row({ entry, depth }: { entry: FileEntry; depth: number }) {
  const expanded = useWorkspace((s) => s.expanded.includes(entry.path));
  const selected = useWorkspace((s) => s.selected?.path === entry.path);
  const busy = useWorkspace((s) => s.busy);
  return (
    <div
      role="treeitem"
      aria-expanded={entry.kind === 'directory' ? expanded : undefined}
      aria-selected={selected}
    >
      <button
        className={`tree-row ${selected ? 'selected' : ''}`}
        style={{ paddingLeft: 14 + depth * 16 }}
        title={
          entry.kind === 'blocked' ? 'Links are not supported' : entry.path
        }
        disabled={busy || entry.kind === 'blocked'}
        onClick={() => {
          actions.select(entry);
          if (entry.kind === 'directory')
            void actions.toggleDirectory(entry.path);
          else void actions.openFile(entry.path);
        }}
      >
        {entry.kind === 'directory' ? (
          <>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
          </>
        ) : (
          <>
            <span className="tree-indent" />
            {entry.kind === 'blocked' ? (
              <Ban size={15} />
            ) : (
              <File
                size={15}
                className={
                  /\.(ts|tsx|js|jsx)$/.test(entry.name) ? 'code-icon' : ''
                }
              />
            )}
          </>
        )}
        <span>{entry.name}</span>
      </button>
      {entry.kind === 'directory' && expanded && (
        <Tree path={entry.path} depth={depth + 1} />
      )}
    </div>
  );
}
export function Explorer() {
  const workspace = useWorkspace((s) => s.workspace);
  const busy = useWorkspace((s) => s.busy);
  const selected = useWorkspace((s) => s.selected);
  const empty = useWorkspace((s) => s.tree['']?.length === 0);
  const detection = useProject((s) => s.detection);
  const projectBusy = useProject((s) => s.busy);
  const [editing, setEditing] = useState(false);
  const project = detection.status === 'found' ? detection : null;
  // Repository state comes from GitService, which actually runs Git.
  const repository = useGit((s) =>
    s.detection.status === 'found' ? s.detection.repository : null,
  );
  // An unreadable manifest still exists on disk, so editing it repairs rather than converts.
  const mode = detection.status === 'none' ? 'convert' : 'settings';
  return (
    <aside className="explorer">
      <div className="panel-heading">
        <span>EXPLORER</span>
        <span className="panel-tag">{project ? 'PROJECT' : 'FILES'}</span>
      </div>
      {workspace ? (
        <>
          <div className="workspace-root">
            <button onClick={() => actions.select(null)} title={workspace.path}>
              <ChevronDown size={13} />
              <span>{project ? project.manifest.name : workspace.name}</span>
            </button>
            <button
              className="icon-button"
              title={
                mode === 'settings'
                  ? 'Project settings'
                  : 'Convert this folder into a TBCE project'
              }
              aria-label={
                mode === 'settings' ? 'Project settings' : 'Convert to project'
              }
              disabled={busy || projectBusy}
              onClick={() => setEditing(true)}
            >
              <Settings2 size={14} />
            </button>
            <button
              className="icon-button"
              title="Refresh explorer"
              aria-label="Refresh explorer"
              disabled={busy}
              onClick={() => void actions.refresh()}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {(project?.manifest.stack || repository) && (
            <div className="project-facts">
              {project?.manifest.stack && <span>{project.manifest.stack}</span>}
              {repository && <span>{headLabel(repository.head)}</span>}
            </div>
          )}
          {detection.status === 'invalid' && (
            <p className="project-warning" role="status">
              {detection.message}
            </p>
          )}
          {editing && (
            <ProjectSettingsDialog
              mode={mode}
              initial={
                project
                  ? fieldsOf(project.manifest)
                  : emptyFields(workspace.name)
              }
              onClose={() => setEditing(false)}
            />
          )}
          <div className="explorer-tools">
            <button
              title="New file"
              aria-label="New file"
              disabled={busy}
              onClick={() => void actions.create(false)}
            >
              <FilePlus2 size={15} />
            </button>
            <button
              title="New folder"
              aria-label="New folder"
              disabled={busy}
              onClick={() => void actions.create(true)}
            >
              <FolderPlus size={15} />
            </button>
            <span />
            <button
              title="Rename selected item"
              aria-label="Rename selected item"
              disabled={busy || !selected}
              onClick={() => void actions.rename()}
            >
              <Pencil size={14} />
            </button>
            <button
              title="Move selected item to Recycle Bin"
              aria-label="Move selected item to Recycle Bin"
              disabled={busy || !selected}
              onClick={() => void actions.trash()}
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="tree" role="tree" aria-label="Workspace files">
            <Tree path="" depth={0} />
            {empty && <p className="muted tree-empty">This folder is empty.</p>}
          </div>
          <div className="explorer-bottom">
            <span className="live-dot" />
            LOCAL WORKSPACE
          </div>
        </>
      ) : (
        <div className="explorer-empty">
          <FolderOpen size={24} />
          <p>No folder open</p>
          <span>Open a project to explore its files.</span>
          <button disabled={busy} onClick={() => void actions.openWorkspace()}>
            Open folder
          </button>
        </div>
      )}
    </aside>
  );
}
