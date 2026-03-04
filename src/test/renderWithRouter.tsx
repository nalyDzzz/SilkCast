import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";

type RenderWithRouterOptions = RenderOptions & {
  initialEntries?: string[];
};

export function renderWithRouter(
  ui: ReactElement,
  { initialEntries = ["/"], ...options }: RenderWithRouterOptions = {}
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
    options
  );
}
