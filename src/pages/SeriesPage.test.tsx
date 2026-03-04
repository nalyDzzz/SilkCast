import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../test/renderWithRouter";
import { SeriesPage } from "./SeriesPage";

describe("SeriesPage", () => {
  it("renders the heading", () => {
    renderWithRouter(<SeriesPage />);
    expect(screen.getByRole("heading", { name: "Series" })).toBeInTheDocument();
  });

  it("renders the placeholder text", () => {
    renderWithRouter(<SeriesPage />);
    expect(screen.getByText("Series page placeholder.")).toBeInTheDocument();
  });
});
