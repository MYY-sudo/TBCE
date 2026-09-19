import { actions, useGit } from '../stores/git';
import { PatchView } from '../components/PatchView';
/// The backend answers with a unified patch rather than two file versions, so this is a read-only
/// patch view instead of a Monaco diff editor. It keeps Git's own rename, binary and truncation
/// reporting intact, and needs nothing from the backend that the milestone did not already deliver.
export default function DiffView() {
  const selected = useGit((s) => s.selected);
  const diff = useGit((s) => s.diff);
  const counted = diff && !diff.binary;
  return (
    <PatchView
      heading={selected?.staged ? 'Staged changes' : 'Local changes'}
      path={diff?.path ?? selected?.path}
      originalPath={diff?.originalPath}
      added={counted ? diff.added : null}
      removed={counted ? diff.removed : null}
      patch={diff?.patch ?? ''}
      closeLabel="Close diff"
      ariaLabel="Diff preview"
      onClose={actions.closeDiff}
    >
      {diff?.binary && (
        <div className="conflict-banner" role="status">
          <span>
            This is a binary file. Git reports that it changed, but there is no
            text to show.
          </span>
        </div>
      )}
      {diff?.truncated && (
        <div className="conflict-banner" role="status">
          <span>
            This patch is longer than TBCE will display. The part shown below is
            incomplete.
          </span>
        </div>
      )}
    </PatchView>
  );
}
