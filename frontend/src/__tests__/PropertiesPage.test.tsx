import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { vi } from "vitest";
import api from "../api";
import { PropertiesPage } from "../pages/PropertiesPage";

vi.mock("../api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

describe("PropertiesPage fuzz", () => {
  it("never crashes with random properties array", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            name: fc.string({ maxLength: 50, minLength: 1 }),
            address: fc.string({ maxLength: 100 }),
          }),
          { maxLength: 10 },
        ),
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            property: fc.integer({ min: 1, max: 100 }),
            resource_type: fc.constantFrom("electricity", "cold_water", "gas"),
            unit: fc.constantFrom("kWh", "м³"),
            serial_number: fc.string({ maxLength: 20 }),
            is_active: fc.boolean(),
          }),
          { maxLength: 10 },
        ),
        async (properties, meters) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          if (properties.length === 0) {
            mockApi.get.mockResolvedValueOnce({ data: [] });
          }
          mockApi.get.mockResolvedValue({ data: meters });
          const onUpdated = vi.fn();
          const onSelect = vi.fn();
          const { container } = render(
            <PropertiesPage
              properties={properties}
              onUpdated={onUpdated}
              selectedProperty={properties.length > 0 ? properties[0].id : null}
              onSelect={onSelect}
            />,
          );
          expect(container.querySelector(".page")).toBeTruthy();
          await new Promise((r) => setTimeout(r, 30));
          expect(container.querySelector(".page")).toBeTruthy();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("handles form submission with random values", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 100, minLength: 1 }),
        fc.string({ maxLength: 200, minLength: 1 }),
        async (name, address) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.post?.mockReset();
          mockApi.get.mockResolvedValue({ data: [] });
          mockApi.post?.mockResolvedValue({ data: { id: 999, name, address } });
          const onUpdated = vi.fn();
          render(
            <PropertiesPage
              properties={[]}
              onUpdated={onUpdated}
              selectedProperty={null}
              onSelect={vi.fn()}
            />,
          );
          const nameInput = screen.getByPlaceholderText(/ЖК Солнечный/) as HTMLInputElement;
          const addrInput = screen.getByPlaceholderText(/улица, дом/) as HTMLInputElement;
          fireEvent.change(nameInput, { target: { value: name } });
          fireEvent.change(addrInput, { target: { value: address } });
          fireEvent.click(screen.getByRole("button", { name: "Добавить объект" }));
          await new Promise((r) => setTimeout(r, 10));
          expect(onUpdated).toHaveBeenCalled();
        },
      ),
      { numRuns: 10 },
    );
  });

  it("handles any selectedProperty value", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, 0, 1, 9999),
        (selectedProperty) => {
          cleanup();
          const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };
          mockApi.get.mockReset();
          mockApi.get.mockResolvedValue({ data: [] });
          const { container } = render(
            <PropertiesPage
              properties={[{ id: 1, name: "X", address: "Y" }]}
              onUpdated={vi.fn()}
              selectedProperty={selectedProperty as number | null}
              onSelect={vi.fn()}
            />,
          );
          expect(container.querySelector(".page")).toBeTruthy();
        },
      ),
      { numRuns: 5 },
    );
  });
});
