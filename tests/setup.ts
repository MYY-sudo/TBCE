import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
// jsdom has no canvas, which xterm only needs to measure glyphs, never to parse input.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
// jsdom renders <dialog> but implements neither modal method.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
afterEach(cleanup);
