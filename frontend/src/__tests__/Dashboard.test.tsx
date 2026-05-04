import { cleanup, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { vi } from "vitest";
import api from "../api";
import { Dashboard } from "../pages/Dashboard";

vi.mock("../api", () => ({ default: { get: vi.fn() } }));

describe("Dashboard fuzz", () => {
  it("handles any properties array without crash", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 9999 }),
            name: fc.string({ maxLength: 100, minLength: 1 }),
            address: fc.string({ maxLength: 200 }),
          }),
          { maxLength: 20 },
        ),
        (properties) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({
            data: { forecast_amount: 0, monthly: [], summary: { total_amount: 0 }, monthly_by_resource: [] },
          });
          const onSelect = vi.fn();
          const { container } = render(
            <Dashboard
              selectedProperty={null}
              properties={properties}
              onSelectProperty={onSelect}
            />,
          );
          expect(container.querySelector(".page") || container.querySelector(".auth-page")).toBeTruthy();
        },
      ),
      { numRuns: 15 },
    );
  });

  it("survives garbage API responses", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          forecast_amount: fc.constantFrom(0, null, undefined, "abc", NaN),
          monthly: fc.array(
            fc.record({
              month: fc.string(),
              total_amount: fc.constantFrom(0, null, undefined, "abc"),
              total_consumption: fc.constantFrom(0, null, undefined, "abc"),
            }),
          ),
          monthly_by_resource: fc.array(
            fc.record({
              month: fc.string(),
              resource_type: fc.string(),
              consumption: fc.constantFrom(0, null, undefined),
              amount: fc.constantFrom(0, null, undefined),
            }),
          ),
        }),
        async (response) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({ data: response });
          const onSelect = vi.fn();
          render(
            <Dashboard
              selectedProperty={1}
              properties={[{ id: 1, name: "Test", address: "Addr" }]}
              onSelectProperty={onSelect}
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

  it("handles any selectedProperty value", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, 0, 1, 9999, -1, NaN),
        (selectedProperty) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({
            data: { forecast_amount: 0, monthly: [], summary: { total_amount: 0 } },
          });
          const { container } = render(
            <Dashboard
              selectedProperty={selectedProperty as number | null}
              properties={[{ id: 1, name: "X", address: "Y" }]}
              onSelectProperty={vi.fn()}
            />,
          );
          expect(container.querySelector(".page")).toBeTruthy();
        },
      ),
      { numRuns: 5 },
    );
  });
});
