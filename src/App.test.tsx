import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("@/router", async () => {
  const { createMemoryRouter } = await import("react-router");

  return {
    appRouter: createMemoryRouter(
      [
        {
          path: "*",
          element: <div>Router Ready</div>,
        },
      ],
      {
        initialEntries: ["/"],
      }
    ),
  };
});

describe("App", () => {
  it("renders the configured router", () => {
    render(<App />);

    expect(screen.getByText("Router Ready")).toBeInTheDocument();
  });
});
