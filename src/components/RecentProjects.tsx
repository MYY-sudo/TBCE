import { X } from 'lucide-react';
import { actions as projectActions, useProject } from '../stores/project';
import { useWorkspace } from '../stores/workspace';
/// The recently opened folders, shared by the Welcome screen and the dashboard so another project is
/// always one click away.
export function RecentProjects() {
  const recent = useProject((s) => s.recent);
  const projectBusy = useProject((s) => s.busy);
  const workspaceBusy = useWorkspace((s) => s.busy);
  if (!recent.length) return null;
  return (
    <div className="recent">
      <span className="field-legend">RECENT</span>
      {recent.map((entry) => (
        <div className="recent-row" key={entry.path}>
          <button
            title={entry.path}
            disabled={workspaceBusy || projectBusy}
            onClick={() => void projectActions.openRecent(entry.path)}
          >
            <span>{entry.name}</span>
            {entry.isProject && (
              <span className="recent-tag">{entry.stack || 'PROJECT'}</span>
            )}
            <span className="recent-path">{entry.path}</span>
          </button>
          <button
            className="icon-button"
            aria-label={`Remove ${entry.name} from recent projects`}
            onClick={() => projectActions.forgetRecent(entry.path)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
