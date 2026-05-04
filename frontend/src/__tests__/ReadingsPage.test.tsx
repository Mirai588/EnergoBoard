import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fc from "fast-check";
import { vi } from "vitest";
import api from "../api";
import { ReadingsPage } from "../pages/ReadingsPage";

vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

describe("ReadingsPage fuzz", () => {
  it("never crashes with random meters and readings data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            resource_type: fc.constantFrom("electricity", "cold_water", "hot_water", "gas", "heating"),
            serial_number: fc.string({ maxLength: 20 }),
            unit: fc.constantFrom("kWh", "м³", "Гкал", ""),
          }),
          { maxLength: 10 },
        ),
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            meter: fc.integer({ min: 1, max: 100 }),
            value: fc.string(),
            reading_date: fc.string(),
            meter_detail: fc.record({
              id: fc.integer({ min: 1, max: 100 }),
              resource_type: fc.constantFrom("electricity", "cold_water"),
              unit: fc.constantFrom("kWh", "м³"),
            }),
            amount_value: fc.constantFrom(null, 0, 100.5, 50, undefined),
          }),
          { maxLength: 20 },
        ),
        async (meters, readings) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.post.mockReset();
          mockApi.get.mockResolvedValueOnce({ data: meters });
          mockApi.get.mockResolvedValueOnce({ data: readings });
          mockApi.post.mockResolvedValue({ data: { id: 999, meter: 1, value: "0", reading_date: "2024-01-01" } });
          render(
            <ReadingsPage
              selectedProperty={1}
              properties={[{ id: 1, name: "Test", address: "Addr" }]}
              onSelectProperty={vi.fn()}
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

  it("handles form submission with random values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 0.001, max: 99999, noNaN: true, noDefaultInfinity: true }),
        fc.boolean(),
        async (readingValue, hasMeters) => {
          cleanup();
          const meters = hasMeters
            ? [{ id: 5, resource_type: "electricity", serial_number: "E-1", unit: "kWh", property: 1 }]
            : [];
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.post.mockReset();
          mockApi.get.mockResolvedValueOnce({ data: meters });
          mockApi.get.mockResolvedValueOnce({ data: [] });
          mockApi.post.mockResolvedValue({ data: { id: 1, meter: 5, value: readingValue, reading_date: "2024-01-01" } });
          render(
            <ReadingsPage
              selectedProperty={1}
              properties={[{ id: 1, name: "Test", address: "Addr" }]}
              onSelectProperty={vi.fn()}
            />,
          );
          await new Promise((r) => setTimeout(r, 20));
          const user = userEvent.setup();
          const valueInput = screen.queryByPlaceholderText(/1245/);
          if (valueInput && hasMeters) {
            await user.clear(valueInput);
            await user.type(valueInput, String(readingValue));
            const saveBtn = screen.queryByRole("button", { name: "Сохранить" });
            if (saveBtn) {
              await user.click(saveBtn);
            }
          }
          expect(document.body).toBeTruthy();
        },
      ),
      { numRuns: 5 },
    );
  });
});
