import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import api from "../api";
import { AnalyticsPage } from "../pages/AnalyticsPage";

vi.mock("../api", () => {
  return { default: { get: vi.fn() } };
});

describe("AnalyticsPage", () => {
  const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockApi.get.mockReset();
    localStorage.clear();
  });

  it("shows analytics summary and forecast", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        period: { start_year: 2024, start_month: 1, end_year: 2024, end_month: 12 },
        monthly: [
          { month: "2024-01", total_amount: 100, total_consumption: 10, cumulative_amount: 100 },
          { month: "2024-02", total_amount: 110, total_consumption: 11, cumulative_amount: 210 },
        ],
        monthly_by_resource: [],
        summary: { total_amount: 210, total_consumption: 21, average_daily_amount: 7, peak_month: "2024-02" },
        comparison: [],
        forecast_amount: 320,
      },
    });

    render(
      <AnalyticsPage
        selectedProperty={1}
        properties={[{ id: 1, name: "Офис", address: "Адрес" }]}
      />,
    );

    expect(await screen.findByText("Исследователь EnergoBoard")).toBeInTheDocument();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    expect(screen.getByText("320.00")).toBeInTheDocument();
    expect(screen.getByText("Сумма за период")).toBeInTheDocument();
  });
});
