import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ProjectSettingsDialog } from '../src/projects/ProjectSettingsDialog';
import { actions } from '../src/stores/project';
import { emptyFields } from '../src/types/project';

vi.mock('../src/stores/project', () => ({
  actions: { saveFields: vi.fn().mockResolvedValue(true) },
  useProject: (selector: (state: { busy: boolean }) => unknown) =>
    selector({ busy: false }),
}));

test('typing preserves spaces and submission trims optional fields', async () => {
  const close = vi.fn();
  render(
    <ProjectSettingsDialog
      mode="settings"
      initial={emptyFields(' My app ')}
      onClose={close}
    />,
  );
  const command = screen.getByLabelText('Dev') as HTMLInputElement;
  for (const character of ' npm run dev ') {
    const expected = command.value + character;
    fireEvent.change(command, { target: { value: expected } });
    expect(command.value).toBe(expected);
  }
  fireEvent.change(screen.getByLabelText('Stack'), {
    target: { value: ' React + TypeScript ' },
  });
  fireEvent.change(screen.getByLabelText('Architecture'), {
    target: { value: '   ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(actions.saveFields).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'My app',
      stack: 'React + TypeScript',
      architecture: null,
      defaultBranch: null,
      commands: { install: null, dev: 'npm run dev', build: null, test: null },
    }),
  );
});
