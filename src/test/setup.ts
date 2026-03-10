import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get() {
    return this.clientWidth ?? 0;
  },
});

Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    return this.clientHeight ?? 0;
  },
});

// Polyfill ResizeObserver for jsdom
(globalThis as any).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock @tauri-apps/api/core
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock @tauri-apps/api/event
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Mock hls.js
vi.mock("hls.js", () => {
  const MockHls = vi.fn(() => ({
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  }));

  (MockHls as any).isSupported = vi.fn(() => false);
  (MockHls as any).Events = {
    MEDIA_ATTACHED: "hlsMediaAttached",
    MANIFEST_PARSED: "hlsManifestParsed",
    ERROR: "hlsError",
  };

  return { default: MockHls };
});
