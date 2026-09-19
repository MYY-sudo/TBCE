import { actions, useGitHub } from '../stores/github';
import { PatchView } from '../components/PatchView';
/// A pull request file's patch, exactly as GitHub sent it with the file list. Nothing is requested
/// to show it, and it is read-only like the local diff.
export default function PullFileView() {
  const open = useGitHub((s) => s.pullFile);
  if (!open) return null;
  const { number, file } = open;
  return (
    <PatchView
      heading={`Pull request #${number}`}
      path={file.path}
      originalPath={file.previousPath}
      added={file.additions}
      removed={file.deletions}
      patch={file.patch ?? ''}
      closeLabel="Close patch"
      ariaLabel="Pull request patch"
      onClose={actions.closePullFile}
    >
      {file.patch === null && (
        <div className="conflict-banner" role="status">
          <span>
            GitHub sent no patch for this file. It does that for binary files
            and for changes too large to show.
          </span>
        </div>
      )}
    </PatchView>
  );
}
