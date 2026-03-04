import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../test/renderWithRouter";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  it("renders the heading", () => {
    renderWithRouter(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Settings" })
    ).toBeInTheDocument();
  });

  it("renders the placeholder text", () => {
    renderWithRouter(<SettingsPage />);
    expect(
      screen.getByText("Settings page placeholder.")
    ).toBeInTheDocument();
  });
});
