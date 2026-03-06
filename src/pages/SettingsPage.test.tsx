import { beforeEach, describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../test/renderWithRouter";
import { SettingsPage } from "./SettingsPage";
import { useAppStore } from "../store/appStore";
import { ALL_GROUPS, DEFAULT_SETTINGS } from "../components/app/types";

function resetStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    sources: [],
    selectedSourceId: null,
    hasPersistedSourceSelection: false,
    groups: [],
    selectedGroup: ALL_GROUPS,
    channels: [],
    recentChannels: [],
    activeChannel: null,
    playback: null,
    settings: DEFAULT_SETTINGS,
    m3uName: "",
    m3uLocation: "",
    searchQuery: "",
    favoritesOnly: false,
    error: null,
    loading: false,
    importMessage: null,
    ...overrides,
  });
}

describe("SettingsPage", () => {
  beforeEach(() => resetStore());

  it("renders the heading", () => {
    renderWithRouter(<SettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Settings" })
    ).toBeInTheDocument();
  });

  it("renders playback settings controls", () => {
    renderWithRouter(<SettingsPage />);
    expect(screen.getByText("Playback")).toBeInTheDocument();
    expect(screen.getByText("Default Player")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Settings" })
    ).toBeInTheDocument();
  });
});
