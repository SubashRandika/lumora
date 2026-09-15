import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { ChoiceGroup } from "./ChoiceGroup";
import { Progress } from "./Progress";
import { Toggle } from "./Toggle";

describe("Button", () => {
  it("defaults to type=button and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Cast spell</Button>);
    const button = screen.getByRole("button", { name: "Cast spell" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("Toggle", () => {
  function Harness() {
    const [on, setOn] = useState(false);
    return <Toggle label="Sound effects" checked={on} onCheckedChange={setOn} />;
  }

  it("exposes switch semantics and toggles with keyboard", async () => {
    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Sound effects" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    toggle.focus();
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});

describe("ChoiceGroup", () => {
  it("renders a labelled radio group and reports changes", async () => {
    const onValueChange = vi.fn();
    render(
      <ChoiceGroup
        legend="Quality"
        choices={[
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ]}
        value="low"
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("group", { name: "Quality" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onValueChange).toHaveBeenCalledWith("high");
  });
});

describe("Progress", () => {
  it("reports a clamped percentage", () => {
    render(<Progress label="Preparing the chamber" value={1.4} />);
    expect(
      screen.getByRole("progressbar", { name: "Preparing the chamber" }),
    ).toHaveAttribute("aria-valuenow", "100");
  });

  it("omits aria-valuenow when indeterminate", () => {
    render(<Progress label="Loading" value={null} />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });
});
