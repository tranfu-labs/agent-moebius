import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MoebiusLogo } from "./moebius-logo";

describe("MoebiusLogo", () => {
  it("renders the canonical raster asset with an accessible brand name", () => {
    render(<MoebiusLogo />);

    const logo = screen.getByRole("img", { name: "Moebius Logo" });
    expect(logo).toHaveAttribute("src", expect.stringContaining("ui-icon-64"));
    expect(logo).toHaveAttribute("draggable", "false");
  });

  it("can be hidden from assistive technology when adjacent text names the brand", () => {
    render(<MoebiusLogo decorative />);

    expect(screen.getByTestId("moebius-logo")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
