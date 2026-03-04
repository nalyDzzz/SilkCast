import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("resolves tailwind conflicts with twMerge", () => {
    const result = cn("p-4", "p-2");
    expect(result).toBe("p-2");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });

  it("filters out falsy values", () => {
    expect(cn("a", undefined, null, "", "b")).toBe("a b");
  });
});
