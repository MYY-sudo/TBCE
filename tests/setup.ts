import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
// jsdom has no canvas, which xterm only needs to measure glyphs, never to parse input.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
afterEach(cleanup);
