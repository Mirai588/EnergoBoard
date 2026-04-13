import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      media: "",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    });
  }

  if (!window.localStorage || typeof window.localStorage.clear !== "function") {
    const storage: Record<string, string> = {};
    const memoryStorage = {
      getItem: (key: string) => (key in storage ? storage[key] : null),
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        Object.keys(storage).forEach((key) => delete storage[key]);
      },
    };
    // @ts-expect-error - allow assignment in test env
    window.localStorage = memoryStorage;
  }
}

// Recharts relies on DOM measurements; replace with light stubs for unit tests.
vi.mock("recharts", () => {
  const React = require("react");
  const Mock = ({ children }: any) => React.createElement("div", null, children);
  return {
    ResponsiveContainer: Mock,
    LineChart: Mock,
    Line: Mock,
    CartesianGrid: Mock,
    XAxis: Mock,
    YAxis: Mock,
    Tooltip: Mock,
    Legend: Mock,
    BarChart: Mock,
    Bar: Mock,
  };
});
