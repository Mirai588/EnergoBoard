import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import api from "../api";
import { ReadingsPage } from "../pages/ReadingsPage";

vi.mock("../api", () => {
  return {
    default: { get: vi.fn(), post: vi.fn() },
  };
});

describe("ReadingsPage", () => {
  const mockApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.post.mockReset();
  });

  it("renders readings and allows adding new one", async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: [{ id: 10, resource_type: "electricity", serial_number: "EL-1" }] }) // meters
      .mockResolvedValueOnce({
        data: [
          {
            id: 1,
            meter: 10,
            value: "100.5",
            reading_date: "2024-01-01",
            meter_detail: { id: 10, resource_type: "electricity", unit: "kWh" },
            amount_value: 12.3,
          },
        ],
      }); // readings
    mockApi.post.mockResolvedValue({
      data: {
        id: 2,
        meter: 10,
        value: "120.0",
        reading_date: "2024-02-01",
        meter_detail: { id: 10, resource_type: "electricity", unit: "kWh" },
      },
    });

    render(
      <ReadingsPage
        selectedProperty={1}
        properties={[{ id: 1, name: "Дом", address: "Улица" }]}
        onSelectProperty={vi.fn()}
      />,
    );

    expect(await screen.findByText("Лента показаний")).toBeInTheDocument();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(2));

    await userEvent.type(screen.getByPlaceholderText("Например, 1245.600"), "120");
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Показание сохранено")).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith(
      "readings/",
      expect.objectContaining({ meter: 10, value: 120 }),
    );
  });
});
