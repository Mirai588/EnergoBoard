import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { vi } from "vitest";
import api from "../api";
import { MetersPage } from "../pages/MetersPage";

vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

describe("MetersPage fuzz", () => {
  it("never crashes with random meter data", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            property: fc.integer({ min: 1, max: 10 }),
            resource_type: fc.constantFrom("electricity", "cold_water", "hot_water", "gas", "heating"),
            unit: fc.constantFrom("kWh", "м³", "Гкал", "kW"),
            serial_number: fc.string({ maxLength: 20, minLength: 1 }),
            is_active: fc.boolean(),
            installed_at: fc.constantFrom("2024-01-01", null),
          }),
          { maxLength: 15 },
        ),
        async (meters) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.post?.mockReset();
          mockApi.get.mockResolvedValue({ data: meters });
          render(
            <MetersPage
              selectedProperty={1}
              properties={[{ id: 1, name: "Test", address: "Addr" }]}
              onSelectProperty={vi.fn()}
            />,
          );
          expect(document.body).toBeTruthy();
          await new Promise((r) => setTimeout(r, 30));
          expect(document.body).toBeTruthy();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("handles random form input without crash", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 50, minLength: 1 }),
        fc.constantFrom("kWh", "м³", "Гкал", "", "  "),
        fc.boolean(),
        async (serial, unit, hasProperty) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.post?.mockReset();
          mockApi.get.mockResolvedValue({ data: [] });
          mockApi.post?.mockResolvedValue({ data: { id: 999, resource_type: "electricity", unit, serial_number: serial } });
          render(
            <MetersPage
              selectedProperty={hasProperty ? 1 : null}
              properties={[{ id: 1, name: "T", address: "A" }]}
              onSelectProperty={vi.fn()}
            />,
          );
          const serialInput = screen.queryByPlaceholderText("Укажите серийный номер") as HTMLInputElement | null;
          if (serialInput && hasProperty) {
            fireEvent.change(serialInput, { target: { value: serial } });
            const saveBtn = screen.queryByRole("button", { name: "Сохранить прибор" });
            if (saveBtn) fireEvent.click(saveBtn);
          }
          expect(document.body).toBeTruthy();
        },
      ),
      { numRuns: 5 },
    );
  });

  it("handles empty/no meters gracefully", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(null, undefined, 0, 1, 9999),
        fc.boolean(),
        (propId, withData) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({ data: withData ? [] : undefined });
          const { container } = render(
            <MetersPage
              selectedProperty={propId as number | null}
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
