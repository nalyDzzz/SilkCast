import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "../../test/renderWithRouter";
import { SidebarPane } from "./SidebarPane";
import { useAppStore } from "../../store/appStore";
import { ALL_GROUPS, DEFAULT_SETTINGS } from "./types";

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

describe("SidebarPane", () => {
  beforeEach(() => resetStore());

  it("renders the version title", () => {
    renderWithRouter(<SidebarPane />);
    expect(screen.getByText("OpenTV v0.1")).toBeInTheDocument();
  });

  it("renders Refresh All button", () => {
    renderWithRouter(<SidebarPane />);
    expect(
      screen.getByRole("button", { name: /Refresh All/i })
    ).toBeInTheDocument();
  });

  it("shows Refreshing text when loading", () => {
    resetStore({ loading: true });
    renderWithRouter(<SidebarPane />);
    expect(
      screen.getByRole("button", { name: /Refreshing/i })
    ).toBeInTheDocument();
  });

  it("renders Log Out button", () => {
    renderWithRouter(<SidebarPane />);
    expect(
      screen.getByRole("button", { name: /Log Out/i })
    ).toBeInTheDocument();
  });

  it("renders All Channels group", () => {
    renderWithRouter(<SidebarPane />);
    expect(screen.getByText("All Channels")).toBeInTheDocument();
  });

  it("renders group list", () => {
    resetStore({
      selectedSourceId: 1,
      groups: [
        { name: "Sports", channel_count: 20 },
        { name: "News", channel_count: 10 },
      ],
    });

    renderWithRouter(<SidebarPane />);
    expect(screen.getByText("Sports")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("News")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("shows total channel count in All Channels", () => {
    resetStore({
      selectedSourceId: 1,
      groups: [
        { name: "Sports", channel_count: 20 },
        { name: "News", channel_count: 10 },
      ],
    });

    renderWithRouter(<SidebarPane />);
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("shows empty state when source exists but no groups", () => {
    resetStore({ selectedSourceId: 1, groups: [] });
    renderWithRouter(<SidebarPane />);
    expect(
      screen.getByText("No groups for this source.")
    ).toBeInTheDocument();
  });

  it("selects a group on click", async () => {
    const user = userEvent.setup();
    resetStore({
      selectedSourceId: 1,
      groups: [{ name: "Sports", channel_count: 20 }],
    });

    renderWithRouter(<SidebarPane />);
    await user.click(screen.getByText("Sports"));
    expect(useAppStore.getState().selectedGroup).toBe("Sports");
  });
});
