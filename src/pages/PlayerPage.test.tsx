import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { PlayerPage } from "./PlayerPage";
import { renderWithRouter } from "../test/renderWithRouter";
import { useAppStore } from "../store/appStore";
import { ALL_GROUPS, DEFAULT_SETTINGS } from "../components/app/types";

function resetStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    sources: [],
    selectedSourceId: 1,
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

describe("PlayerPage", () => {
  beforeEach(() => resetStore());

  it("renders empty in-app player prompt when nothing is active", () => {
    renderWithRouter(<PlayerPage />, {
      initialEntries: ["/dashboard/player"],
    });

    expect(screen.getByText("Nothing is playing")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pick something from Live TV, Movies, or Series to start playback."
      )
    ).toBeInTheDocument();
  });

  it("shows disabled message when preferred player is mpv", () => {
    resetStore({
      settings: {
        ...DEFAULT_SETTINGS,
        preferred_player: "mpv",
      },
    });

    renderWithRouter(<PlayerPage />, {
      initialEntries: ["/dashboard/player"],
    });

    expect(screen.getByText("Web Player Is Disabled")).toBeInTheDocument();
  });
});
