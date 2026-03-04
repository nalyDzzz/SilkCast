import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "../../test/renderWithRouter";
import { ChannelsPane } from "./ChannelsPane";
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

describe("ChannelsPane", () => {
  beforeEach(() => resetStore());

  it("renders Channels title", () => {
    renderWithRouter(<ChannelsPane />);
    expect(screen.getByText("Channels")).toBeInTheDocument();
  });

  it("shows 'Select or import a source' when no source selected", () => {
    renderWithRouter(<ChannelsPane />);
    expect(
      screen.getByText("Select or import a source")
    ).toBeInTheDocument();
  });

  it("shows source name and channel count when source is selected", () => {
    resetStore({
      sources: [
        {
          id: 1,
          source_type: "m3u",
          name: "My Playlist",
          config: {},
          created_at: 1000,
        },
      ],
      selectedSourceId: 1,
      channels: [
        {
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
        {
          id: 2,
          source_id: 1,
          name: "ESPN",
          group_name: "Sports",
          logo: null,
          tvg_id: null,
          tvg_name: null,
          stream_url: "http://espn.m3u8",
          media_kind: "live",
          is_favorite: false,
        },
      ],
    });

    renderWithRouter(<ChannelsPane />);
    expect(
      screen.getByText("My Playlist - 2 channels")
    ).toBeInTheDocument();
  });

  it("renders channel names in the list", () => {
    resetStore({
      sources: [
        {
          id: 1,
          source_type: "m3u",
          name: "Test",
          config: {},
          created_at: 1000,
        },
      ],
      selectedSourceId: 1,
      channels: [
        {
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
      ],
    });

    renderWithRouter(<ChannelsPane />);
    expect(screen.getByText("CNN")).toBeInTheDocument();
    expect(screen.getByText("News")).toBeInTheDocument();
  });

  it("shows empty state when source exists but no channels match", () => {
    resetStore({
      selectedSourceId: 1,
      channels: [],
    });

    renderWithRouter(<ChannelsPane />);
    expect(
      screen.getByText("No channels match your filters.")
    ).toBeInTheDocument();
  });

  it("renders the search input", () => {
    renderWithRouter(<ChannelsPane />);
    expect(
      screen.getByPlaceholderText("Search channels")
    ).toBeInTheDocument();
  });

  it("renders the favorites checkbox", () => {
    renderWithRouter(<ChannelsPane />);
    expect(screen.getByText("Favorites only")).toBeInTheDocument();
  });
});
