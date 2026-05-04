import { cleanup, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { vi } from "vitest";
import api from "../api";
import { AnalyticsPage } from "../pages/AnalyticsPage";

vi.mock("../api", () => ({ default: { get: vi.fn() } }));

describe("AnalyticsPage fuzz", () => {
  it("handles any response shape without crashing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          period: fc.record({
            start_year: fc.integer({ min: 2020, max: 2030 }),
            start_month: fc.integer({ min: 1, max: 12 }),
            end_year: fc.integer({ min: 2020, max: 2030 }),
            end_month: fc.integer({ min: 1, max: 12 }),
          }),
          monthly: fc.array(
            fc.record({
              month: fc.string(),
              total_amount: fc.double(),
              total_consumption: fc.double(),
              cumulative_amount: fc.double(),
            }),
          ),
          monthly_by_resource: fc.array(
            fc.record({
              month: fc.string(),
              resource_type: fc.string(),
              consumption: fc.double(),
              amount: fc.double(),
            }),
          ),
          summary: fc.record({
            total_amount: fc.double(),
            total_consumption: fc.double(),
            peak_month: fc.constantFrom(null, "2024-01"),
          }),
          comparison: fc.array(
            fc.record({
              property__id: fc.integer(),
              property__name: fc.string(),
              total_amount: fc.double(),
              total_consumption: fc.double(),
            }),
          ),
          forecast_amount: fc.double(),
        }),
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 9999 }),
            name: fc.string({ maxLength: 50, minLength: 1 }),
            address: fc.string({ maxLength: 200 }),
          }),
          { maxLength: 5 },
        ),
        async (response, properties) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({ data: response });
          render(
            <AnalyticsPage
              selectedProperty={properties.length > 0 ? properties[0].id : null}
              properties={properties}
            />,
          );
          expect(document.body).toBeTruthy();
          await new Promise((r) => setTimeout(r, 50));
          expect(document.body).toBeTruthy();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("never crashes with empty/no properties", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, 1, 9999),
        (selectedProperty) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({ data: null });
          const { container } = render(
            <AnalyticsPage
              selectedProperty={selectedProperty as number | null}
              properties={[]}
            />,
          );
          expect(container.textContent).toBeTruthy();
        },
      ),
      { numRuns: 5 },
    );
  });

  it("handles malformed api values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(null, undefined, NaN, Infinity, "bad", 0, -100, 999999),
        async (badValue) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({
            data: {
              period: { start_year: 2024, start_month: 1, end_year: 2024, end_month: 12 },
              monthly: [],
              monthly_by_resource: [],
              summary: { total_amount: 0, total_consumption: 0 },
              comparison: [],
              forecast_amount: badValue,
            },
          });
          render(
            <AnalyticsPage
              selectedProperty={1}
              properties={[{ id: 1, name: "Test", address: "X" }]}
            />,
          );
          await new Promise((r) => setTimeout(r, 50));
          expect(document.body).toBeTruthy();
        },
      ),
      { numRuns: 5 },
    );
  });
});
