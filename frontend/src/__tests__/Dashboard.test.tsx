import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import api from "../api";
import { Dashboard } from "../pages/Dashboard";

vi.mock("../api", () => {
  return { default: { get: vi.fn() } };
});

describe("Dashboard", () => {
  const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockApi.get.mockReset();
    localStorage.clear();
  });

  it("loads forecast and analytics for selected property", async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { forecast_amount: 512.25 } }) // forecast
      .mockResolvedValueOnce({ data: [] }) // readings
      .mockResolvedValueOnce({
        data: {
          monthly: [
            { month: "2024-01", total_amount: 100, total_consumption: 10 },
            { month: "2024-02", total_amount: 120, total_consumption: 12 },
          ],
          summary: { total_amount: 220 },
          monthly_by_resource: [],
        },
      });

    render(
      <Dashboard
        selectedProperty={1}
        properties={[{ id: 1, name: "Дом", address: "Улица" }]}
        onSelectProperty={vi.fn()}
      />,
    );

    expect(await screen.findByText("512.25 ₽")).toBeInTheDocument();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(3));
    expect(screen.getByText("Дашборд энергопотребления")).toBeInTheDocument();
  });
});
