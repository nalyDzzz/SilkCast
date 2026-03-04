import { cn } from "./utils";

describe("cn", () => {
  it("merges conflicting Tailwind classes with last-one-wins behavior", () => {
    expect(cn("p-2", "p-4", "text-sm", "text-lg")).toBe("p-4 text-lg");
  });

  it("keeps truthy conditional classes", () => {
    expect(
      cn("inline-flex", {
        "font-semibold": true,
        hidden: false,
      })
    ).toBe("inline-flex font-semibold");
  });
});
