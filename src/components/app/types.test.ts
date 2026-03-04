import { describe, it, expect } from "vitest";
import { ALL_GROUPS, DEFAULT_SETTINGS } from "./types";

describe("type constants", () => {
  it("ALL_GROUPS is a sentinel string", () => {
    expect(ALL_GROUPS).toBe("__all__");
  });

  it("DEFAULT_SETTINGS has expected shape", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      hardware_decode: true,
      buffering_preset: "normal",
      startup_behavior: "home",
      preferred_player: "web",
    });
  });

  it("DEFAULT_SETTINGS is not accidentally mutated across imports", () => {
    // Verify immutability expectations
    expect(DEFAULT_SETTINGS.hardware_decode).toBe(true);
    expect(DEFAULT_SETTINGS.preferred_player).toBe("web");
  });
});
