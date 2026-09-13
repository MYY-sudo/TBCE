import { useEffect, useRef, useState } from 'react';
import { answer, useDialog, type DialogRequest } from '../stores/dialog';
function DialogContent({ request }: { request: DialogRequest }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(request.input ?? '');
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        answer(null);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (request.input !== undefined && value.trim()) answer(value);
        }}
      >
        <span className="eyebrow">TBCE WORKSPACE</span>
        <h2>{request.title}</h2>
        <p>{request.message}</p>
        {request.input !== undefined && (
          <input
            aria-label="Name"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
        <div className="dialog-actions">
          {request.actions.map((action, index) => (
            <button
              key={action.value}
              type="button"
              className={
                action.danger
                  ? 'danger'
                  : index === request.actions.length - 1
                    ? 'primary'
                    : ''
              }
              disabled={action.value === 'submit' && !value.trim()}
              onClick={() =>
                answer(
                  action.value === 'cancel'
                    ? null
                    : action.value === 'submit'
                      ? value
                      : action.value,
                )
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </form>
    </dialog>
  );
}
export function Dialog() {
  const request = useDialog((s) => s.request);
  return request ? (
    <DialogContent key={request.title + request.message} request={request} />
  ) : null;
}
