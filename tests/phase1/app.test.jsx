import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import App from "../../frontend/App";

describe("Phase 1: App Structure", () => {
  it("renders without crashing", () => {
    render(<App />);
  });

  it("has a header element", () => {
    const { container } = render(<App />);
    expect(container.querySelector("header")).not.toBeNull();
  });

  it("has a main element", () => {
    const { container } = render(<App />);
    expect(container.querySelector("main")).not.toBeNull();
  });

  it("has a footer element", () => {
    const { container } = render(<App />);
    expect(container.querySelector("footer")).not.toBeNull();
  });
});
