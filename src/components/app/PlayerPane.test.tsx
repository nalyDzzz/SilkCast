import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../test/renderWithRouter";
import { PlayerPane } from "./PlayerPane";
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

describe("PlayerPane", () => {
  beforeEach(() => resetStore());

  it("renders Player title with web default", () => {
    renderWithRouter(<PlayerPane />);
    expect(screen.getByText(/Player.*Web Default/i)).toBeInTheDocument();
  });

  it("renders Player title with MPV default when preferred", () => {
    resetStore({
      settings: { ...DEFAULT_SETTINGS, preferred_player: "mpv" },
    });
    renderWithRouter(<PlayerPane />);
    expect(screen.getByText(/Player.*MPV Default/i)).toBeInTheDocument();
  });

  it("shows overlay message when no channel is active", () => {
    renderWithRouter(<PlayerPane />);
    expect(
      screen.getByText("Select a channel to start playback")
    ).toBeInTheDocument();
  });

  it("shows MPV overlay when preferred player is mpv", () => {
    resetStore({
      settings: { ...DEFAULT_SETTINGS, preferred_player: "mpv" },
    });
    renderWithRouter(<PlayerPane />);
    expect(
      screen.getByText("Select a channel to launch MPV pop-out playback")
    ).toBeInTheDocument();
  });

  it("renders player control buttons", () => {
    renderWithRouter(<PlayerPane />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "-10s" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+10s" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fullscreen" })
    ).toBeInTheDocument();
  });

  it("renders MPV and Stop buttons", () => {
    renderWithRouter(<PlayerPane />);
    expect(
      screen.getByRole("button", { name: "Open In MPV Pop-out" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stop In-App" })
    ).toBeInTheDocument();
  });

  it("renders Settings card", () => {
    renderWithRouter(<PlayerPane />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save Settings" })
    ).toBeInTheDocument();
  });

  it("renders Recents card with empty state", () => {
    renderWithRouter(<PlayerPane />);
    expect(screen.getByText("Recents")).toBeInTheDocument();
    expect(
      screen.getByText("No recently played channels.")
    ).toBeInTheDocument();
  });

  it("renders recent channels list", () => {
    resetStore({
      recentChannels: [
        {
          channel: {
            id: 1,
            source_id: 1,
            name: "CNN",
            group_name: "News",
            logo: null,
            tvg_id: null,
            tvg_name: null,
            stream_url: "http://cnn.m3u8",
            media_kind: "live",
            is_favorite: false,
          },
          played_at: 1700000000,
        },
      ],
    });

    renderWithRouter(<PlayerPane />);
    expect(screen.getByText("CNN")).toBeInTheDocument();
  });

  it("shows info lines with defaults", () => {
    renderWithRouter(<PlayerPane />);
    expect(screen.getByText(/Active Channel:/)).toBeInTheDocument();
    expect(screen.getByText(/Web Status:/)).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
    // "none" appears in multiple info lines (Active Channel, MPV URL, etc.)
    expect(screen.getAllByText("none").length).toBeGreaterThanOrEqual(1);
  });

  it("shows error when present", () => {
    resetStore({ error: "Something failed" });
    renderWithRouter(<PlayerPane />);
    expect(screen.getByText("Something failed")).toBeInTheDocument();
  });
});
