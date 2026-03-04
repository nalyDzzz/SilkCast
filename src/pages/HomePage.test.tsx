import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "../test/renderWithRouter";
import { HomePage } from "./HomePage";
import { useAppStore } from "../store/appStore";
import { ALL_GROUPS, DEFAULT_SETTINGS } from "../components/app/types";

// Mock the API so loadSources doesn't hit Tauri
vi.mock("../lib/api/sourcesApi", () => ({
  listRegisteredSources: vi.fn(() => Promise.resolve([])),
  listSourceGroups: vi.fn(() => Promise.resolve([])),
  addM3uSource: vi.fn(),
  refreshM3uSource: vi.fn(),
  deleteRegisteredSource: vi.fn(),
}));

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

describe("HomePage", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("renders the OpenTV heading", () => {
    renderWithRouter(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "OpenTV" })
    ).toBeInTheDocument();
  });

  it("renders the import description text", () => {
    renderWithRouter(<HomePage />);
    expect(
      screen.getByText(/Import an M3U playlist/)
    ).toBeInTheDocument();
  });

  it("renders Select Playlist card", () => {
    renderWithRouter(<HomePage />);
    expect(screen.getByText("Select Playlist")).toBeInTheDocument();
  });

  it("renders Import M3U Playlist card", () => {
    renderWithRouter(<HomePage />);
    expect(screen.getByText("Import M3U Playlist")).toBeInTheDocument();
  });

  it("shows 'No playlists imported yet.' when no sources", () => {
    renderWithRouter(<HomePage />);
    expect(
      screen.getByText("No playlists imported yet.")
    ).toBeInTheDocument();
  });

  it("disables Log In button when no source is selected", () => {
    renderWithRouter(<HomePage />);
    expect(
      screen.getByRole("button", { name: "Log In To Dashboard" })
    ).toBeDisabled();
  });

  it("renders import form inputs", () => {
    renderWithRouter(<HomePage />);
    expect(
      screen.getByPlaceholderText("Playlist name")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("https://... or /path/to/file.m3u")
    ).toBeInTheDocument();
  });

  it("shows import message when present", () => {
    resetStore({ importMessage: "Imported 50 channels." });
    renderWithRouter(<HomePage />);
    expect(screen.getByText("Imported 50 channels.")).toBeInTheDocument();
  });

  it("shows error message when present", () => {
    resetStore({ error: "Failed to import" });
    renderWithRouter(<HomePage />);
    expect(screen.getByText("Failed to import")).toBeInTheDocument();
  });

  it("updates store when typing in name input", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HomePage />);
    const nameInput = screen.getByPlaceholderText("Playlist name");
    await user.type(nameInput, "Test");
    expect(useAppStore.getState().m3uName).toBe("Test");
  });

  it("updates store when typing in location input", async () => {
    const user = userEvent.setup();
    renderWithRouter(<HomePage />);
    const locationInput = screen.getByPlaceholderText(
      "https://... or /path/to/file.m3u"
    );
    await user.type(locationInput, "http://example.com/list.m3u");
    expect(useAppStore.getState().m3uLocation).toBe(
      "http://example.com/list.m3u"
    );
  });

  it("shows loading state on import button", () => {
    resetStore({ loading: true });
    renderWithRouter(<HomePage />);
    expect(
      screen.getByRole("button", { name: "Importing..." })
    ).toBeDisabled();
  });
});
