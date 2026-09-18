import { useState } from 'react';
import {
  ArrowLeft,
  CircleCheck,
  CircleDot,
  CircleSlash,
  ListFilter,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { actions, useGitHub } from '../stores/github';
import { ask } from '../stores/dialog';
import {
  dateLabel,
  issueStateLabel,
  type GitHubIssue,
  type GitHubLabel,
} from '../types/github';
/// GitHub's own limits, mirrored so the form stops typing where the backend would refuse.
const TITLE_MAX = 256;
const BODY_MAX = 65536;
function StateIcon({ issue }: { issue: GitHubIssue }) {
  if (issue.state === 'open') return <CircleDot size={13} />;
  return issue.stateReason === 'not_planned' ? (
    <CircleSlash size={13} />
  ) : (
    <CircleCheck size={13} />
  );
}
function Labels({ labels }: { labels: GitHubLabel[] }) {
  if (!labels.length) return null;
  return (
    <span className="github-tags">
      {labels.map((label) => (
        <span className="github-tag" key={label.name}>
          {label.color && (
            <span
              className="github-swatch"
              // The backend passes six hexadecimal digits or nothing, so nothing else reaches here.
              style={{ background: `#${label.color}` }}
            />
          )}
          {label.name}
        </span>
      ))}
    </span>
  );
}
/// Toggles one name in a list, keeping the order in which names were chosen.
const toggle = (list: string[], name: string) =>
  list.includes(name)
    ? list.filter((entry) => entry !== name)
    : [...list, name];
function IssueForm({ busy }: { busy: boolean }) {
  const { draft, choices } = useGitHub();
  return (
    <form
      className="github-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.title.trim()) void actions.createIssue();
      }}
    >
      <div className="github-section">NEW ISSUE</div>
      <label className="field">
        <span>Title</span>
        <input
          className="github-input"
          value={draft.title}
          maxLength={TITLE_MAX}
          disabled={busy}
          onChange={(event) => actions.editDraft({ title: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          value={draft.body}
          maxLength={BODY_MAX}
          disabled={busy}
          placeholder="Plain text. GitHub renders Markdown on its own site."
          onChange={(event) => actions.editDraft({ body: event.target.value })}
        />
      </label>
      {!choices ? (
        busy ? (
          <p className="muted github-empty">
            Reading labels, assignees and milestones.
          </p>
        ) : (
          <button type="button" onClick={() => void actions.loadChoices()}>
            Read labels, assignees and milestones
          </button>
        )
      ) : (
        <>
          <fieldset className="github-choices">
            <legend>Labels</legend>
            {!choices.labels.length && (
              <span className="github-meta">No labels in this repository.</span>
            )}
            {choices.labels.map((label) => (
              <label key={label.name} title={label.description ?? undefined}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.labels.includes(label.name)}
                  onChange={() =>
                    actions.editDraft({
                      labels: toggle(draft.labels, label.name),
                    })
                  }
                />
                <Labels labels={[label]} />
              </label>
            ))}
          </fieldset>
          <fieldset className="github-choices">
            <legend>Assignees</legend>
            {!choices.assignees.length && (
              <span className="github-meta">Nobody can be assigned.</span>
            )}
            {choices.assignees.map((login) => (
              <label key={login}>
                <input
                  type="checkbox"
                  disabled={
                    busy ||
                    (!draft.assignees.includes(login) &&
                      draft.assignees.length >= 10)
                  }
                  checked={draft.assignees.includes(login)}
                  onChange={() =>
                    actions.editDraft({
                      assignees: toggle(draft.assignees, login),
                    })
                  }
                />
                <span>{login}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>Milestone</span>
            <select
              value={draft.milestone ?? ''}
              disabled={busy}
              onChange={(event) =>
                actions.editDraft({
                  milestone: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            >
              <option value="">No milestone</option>
              {choices.milestones.map((milestone) => (
                <option key={milestone.number} value={milestone.number}>
                  {milestone.title}
                </option>
              ))}
            </select>
          </label>
          {choices.truncated && (
            <p className="github-meta">
              This repository has more labels, assignees or milestones than TBCE
              lists here.
            </p>
          )}
        </>
      )}
      <p className="github-meta">
        GitHub applies labels, assignees and a milestone only for people with
        push access, and TBCE tells you if any were left out.
      </p>
      <div className="github-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => actions.compose(false)}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="primary"
          disabled={busy || !draft.title.trim()}
        >
          Create issue
        </button>
      </div>
    </form>
  );
}
function IssueView({ busy }: { busy: boolean }) {
  const issue = useGitHub((state) => state.selectedIssue)!;
  const close = async () => {
    const reason = await ask({
      title: `Close issue #${issue.number}`,
      message:
        'Closing notifies everyone watching this issue on GitHub. It can be reopened afterwards.',
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Close as not planned', value: 'notPlanned' },
        { label: 'Close as completed', value: 'completed' },
      ],
    });
    if (reason === 'completed' || reason === 'notPlanned')
      void actions.closeIssue(reason);
  };
  return (
    <>
      <button
        className="github-back"
        disabled={busy}
        onClick={() => actions.backToIssues()}
      >
        <ArrowLeft size={13} /> Back to issues
      </button>
      <h3 className="github-issue-heading">
        {issue.title} <span className="github-oid">#{issue.number}</span>
      </h3>
      <div className="github-badges">
        <span className="github-badge">
          <StateIcon issue={issue} /> {issueStateLabel(issue)}
        </span>
      </div>
      <p className="github-meta">
        Opened by {issue.author ?? 'someone'} · {dateLabel(issue.createdAt)}
        {issue.closedAt ? ` · closed ${dateLabel(issue.closedAt)}` : ''}
      </p>
      <Labels labels={issue.labels} />
      <div className="github-detail">
        <span className="github-label">Assignees</span>
        <span className="github-value">
          {issue.assignees.length ? issue.assignees.join(', ') : 'Nobody'}
        </span>
      </div>
      <div className="github-detail">
        <span className="github-label">Milestone</span>
        <span className="github-value">{issue.milestone?.title ?? 'None'}</span>
      </div>
      <pre className="github-body">
        {issue.body?.trim() ? issue.body : 'No description provided.'}
      </pre>
      <p className="github-meta">
        {issue.comments} comment{issue.comments === 1 ? '' : 's'} on GitHub.
        Comments are not shown in this release.
      </p>
      <div className="github-actions">
        {issue.state === 'open' ? (
          <button disabled={busy} onClick={() => void close()}>
            Close issue
          </button>
        ) : (
          <button disabled={busy} onClick={() => void actions.reopenIssue()}>
            Reopen issue
          </button>
        )}
      </div>
    </>
  );
}
export function IssuesTab({ busy }: { busy: boolean }) {
  const {
    issues,
    issuesMore,
    issuesDenied,
    issuesDisabled,
    issuesError,
    issueFilter,
    choices,
    selectedIssue,
    composing,
  } = useGitHub();
  const [filtering, setFiltering] = useState(false);
  if (issuesDisabled)
    return (
      <p className="muted github-empty">
        Issues are turned off for this repository.
      </p>
    );
  if (selectedIssue) return <IssueView busy={busy} />;
  if (composing) return <IssueForm busy={busy} />;
  const filtered = Boolean(
    issueFilter.label || issueFilter.assignee || issueFilter.milestone,
  );
  return (
    <>
      <div className="github-issue-bar">
        <div className="github-segment" role="group" aria-label="Issue state">
          {(['open', 'closed'] as const).map((state) => (
            <button
              key={state}
              aria-pressed={issueFilter.state === state}
              className={issueFilter.state === state ? 'selected' : ''}
              disabled={busy}
              onClick={() =>
                issueFilter.state !== state &&
                void actions.setIssueFilter({ state })
              }
            >
              {state === 'open' ? 'Open' : 'Closed'}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          title="Filters"
          aria-label="Filters"
          aria-expanded={filtering}
          disabled={busy && !filtering}
          onClick={() => {
            setFiltering(!filtering);
            if (!filtering) void actions.loadChoices();
          }}
        >
          <ListFilter size={14} />
        </button>
        <button
          className="icon-button"
          title="New issue"
          aria-label="New issue"
          disabled={busy || issuesDenied}
          onClick={() => {
            actions.compose(true);
            void actions.loadChoices();
          }}
        >
          <Plus size={14} />
        </button>
      </div>
      {filtering && (
        <div className="github-filters">
          <label className="field">
            <span>Label</span>
            <select
              value={issueFilter.label ?? ''}
              disabled={busy || !choices}
              onChange={(event) =>
                void actions.setIssueFilter({
                  label: event.target.value || null,
                })
              }
            >
              <option value="">Any label</option>
              {issueFilter.label &&
                !choices?.labels.some((l) => l.name === issueFilter.label) && (
                  <option value={issueFilter.label}>{issueFilter.label}</option>
                )}
              {choices?.labels.map((label) => (
                <option key={label.name} value={label.name}>
                  {label.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Assignee</span>
            <select
              value={issueFilter.assignee ?? ''}
              disabled={busy || !choices}
              onChange={(event) =>
                void actions.setIssueFilter({
                  assignee: event.target.value || null,
                })
              }
            >
              <option value="">Anyone</option>
              <option value="none">Nobody</option>
              {choices?.assignees.map((login) => (
                <option key={login} value={login}>
                  {login}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Milestone</span>
            <select
              value={issueFilter.milestone ?? ''}
              disabled={busy || !choices}
              onChange={(event) =>
                void actions.setIssueFilter({
                  milestone: event.target.value || null,
                })
              }
            >
              <option value="">Any milestone</option>
              <option value="none">No milestone</option>
              {choices?.milestones.map((milestone) => (
                <option key={milestone.number} value={String(milestone.number)}>
                  {milestone.title}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <button
              disabled={busy}
              onClick={() =>
                void actions.setIssueFilter({
                  label: null,
                  assignee: null,
                  milestone: null,
                })
              }
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <div className="github-section">
        {issueFilter.state === 'open' ? 'OPEN ISSUES' : 'CLOSED ISSUES'}
        {filtered ? ' · FILTERED' : ''}
        <span>{issues.length}</span>
      </div>
      {issuesDenied && (
        <p className="muted github-empty">
          This token cannot read issues. A fine-grained token needs Issues: Read
          access; everything else in this panel is unaffected.
        </p>
      )}
      {issuesError && (
        <p className="project-warning" role="alert">
          Issues unavailable: {issuesError} Use Refresh to try again.
        </p>
      )}
      {!issuesDenied && !issuesError && !issues.length && (
        <p className="muted github-empty">
          {filtered
            ? 'No issues match these filters.'
            : issueFilter.state === 'open'
              ? 'No open issues.'
              : 'No closed issues.'}
        </p>
      )}
      {issues.map((issue) => (
        <button
          className="github-issue"
          key={issue.number}
          disabled={busy}
          onClick={() => void actions.openIssue(issue.number)}
        >
          <StateIcon issue={issue} />
          <span className="github-issue-title">{issue.title}</span>
          <span className="github-meta">
            #{issue.number} · {issue.author ?? 'someone'} ·{' '}
            {dateLabel(issue.createdAt)}
            {issue.milestone ? ` · ${issue.milestone.title}` : ''}
            {issue.assignees.length ? ` · ${issue.assignees.join(', ')}` : ''}
            {issue.comments ? (
              <>
                {' · '}
                <MessageSquare size={10} /> {issue.comments}
              </>
            ) : null}
          </span>
          <Labels labels={issue.labels} />
        </button>
      ))}
      {issuesMore && (
        <button disabled={busy} onClick={() => void actions.moreIssues()}>
          Load more issues
        </button>
      )}
    </>
  );
}
