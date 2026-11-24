import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import type { CadenceUnit } from "@/lib/subscriptions/schedule";
import type { CadenceChoice } from "../../lib/dialog";
import { CadenceField, type CadenceFieldProps } from "../CadenceField";

/** The field with its own state, as the dialog's form holds it. */
function Held(props: Partial<CadenceFieldProps> & { start?: CadenceChoice }) {
	const { start = "monthly", ...rest } = props;
	const [preset, setPreset] = useState<CadenceChoice>(start);
	const [every, setEvery] = useState("2");
	const [unit, setUnit] = useState<CadenceUnit>("month");
	return (
		<CadenceField
			preset={preset}
			onPresetChange={setPreset}
			every={every}
			onEveryChange={setEvery}
			unit={unit}
			onUnitChange={setUnit}
			{...rest}
		/>
	);
}

function setup(props: Parameters<typeof Held>[0] = {}) {
	renderInApp(<Held {...props} />);
	return userEvent.setup();
}

const choice = (name: string) => screen.getByRole("radio", { name });

describe("How often (BR-F05-24)", () => {
	test("offers Weekly, Monthly, Every 3 months, Yearly and Custom, in that order", () => {
		setup();
		expect(screen.getByRole("radiogroup", { name: "How often" })).toBeVisible();
		expect(
			screen.getAllByRole("radio").map((radio) => radio.textContent),
		).toEqual(["Weekly", "Monthly", "Every 3 months", "Yearly", "Custom"]);
	});

	test("the given choice is the checked one", () => {
		setup({ start: "yearly" });
		expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(
			"Yearly",
		);
	});

	test("choosing another changes it", async () => {
		const user = setup();
		await user.click(choice("Weekly"));
		expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(
			"Weekly",
		);
	});

	test("the group is one Tab stop: arrows move between the choices and Space chooses", async () => {
		const user = setup();
		await user.tab();
		expect(choice("Weekly")).toHaveFocus();
		await user.keyboard("{ArrowRight}{ArrowRight}");
		expect(choice("Every 3 months")).toHaveFocus();
		expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(
			"Monthly",
		);
		await user.keyboard(" ");
		expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(
			"Every 3 months",
		);
		await user.tab();
		expect(choice("Every 3 months")).not.toHaveFocus();
	});

	test("the chosen choice shows a check mark, so colour is not the only sign", () => {
		setup({ start: "yearly" });
		expect(choice("Yearly").querySelector("svg")).not.toBeNull();
		expect(choice("Monthly").querySelector("svg")).toBeNull();
	});

	test("pressing the chosen choice again keeps it chosen", async () => {
		const user = setup();
		await user.click(choice("Monthly"));
		expect(screen.getByRole("radio", { checked: true })).toHaveAccessibleName(
			"Monthly",
		);
	});

	test("a preset shows no custom fields", () => {
		setup();
		expect(screen.queryByRole("textbox", { name: "Every" })).toBeNull();
		expect(screen.queryByText(/Every 2 months, every 6 months/)).toBeNull();
	});
});

describe("Custom (BR-F05-24)", () => {
	test("shows Every, Unit and the hint", () => {
		setup({ start: "custom" });
		expect(screen.getByRole("textbox", { name: "Every" })).toHaveValue("2");
		expect(screen.getByRole("button", { name: /Unit/ })).toHaveTextContent(
			"months",
		);
		expect(
			screen.getByText("Every 2 months, every 6 months, every 2 weeks…"),
		).toBeVisible();
	});

	test("choosing Custom reveals them", async () => {
		const user = setup();
		await user.click(choice("Custom"));
		expect(screen.getByRole("textbox", { name: "Every" })).toBeVisible();
	});

	test("typing drops other characters and keeps two digits", async () => {
		const user = setup({ start: "custom" });
		const box = screen.getByRole("textbox", { name: "Every" });
		await user.clear(box);
		await user.type(box, "1a2b3");
		expect(box).toHaveValue("12");
	});

	test("the unit can be weeks", async () => {
		const user = setup({ start: "custom" });
		await user.click(screen.getByRole("button", { name: /Unit/ }));
		await user.click(screen.getByRole("option", { name: "weeks" }));
		expect(screen.getByRole("button", { name: /Unit/ })).toHaveTextContent(
			"weeks",
		);
	});

	test("the hint runs under the whole row and describes the number", () => {
		setup({ start: "custom" });
		const hint = screen.getByText(
			"Every 2 months, every 6 months, every 2 weeks…",
		);
		expect(
			screen.getByRole("textbox", { name: "Every" }),
		).toHaveAccessibleDescription(hint.textContent ?? "");
		expect(hint.parentElement?.firstElementChild).toContainElement(
			screen.getByRole("textbox", { name: "Every" }),
		);
	});

	test("an error replaces the hint and marks the number invalid", () => {
		setup({ start: "custom", error: "Enter how many months, from 1 to 24." });
		expect(
			screen.getByText("Enter how many months, from 1 to 24."),
		).toBeVisible();
		expect(
			screen.queryByText("Every 2 months, every 6 months, every 2 weeks…"),
		).toBeNull();
		expect(screen.getByRole("textbox", { name: "Every" })).toBeInvalid();
	});

	test("with no error the number is valid", () => {
		setup({ start: "custom" });
		expect(screen.getByRole("textbox", { name: "Every" })).toBeValid();
	});

	test("a disabled field disables its choices and its number", () => {
		setup({ start: "custom", isDisabled: true });
		expect(choice("Weekly")).toBeDisabled();
		expect(screen.getByRole("textbox", { name: "Every" })).toBeDisabled();
	});
});

describe("the Was hint (BR-F05-24)", () => {
	test("shows when given", () => {
		setup({ was: "Was Monthly" });
		expect(screen.getByText("Was Monthly")).toBeVisible();
	});

	test("is not there otherwise", () => {
		setup();
		expect(screen.queryByText(/^Was /)).toBeNull();
	});
});

test("reports a choice to its caller", async () => {
	const onPresetChange = vi.fn();
	renderInApp(
		<CadenceField
			preset="monthly"
			onPresetChange={onPresetChange}
			every="2"
			onEveryChange={vi.fn()}
			unit="month"
			onUnitChange={vi.fn()}
		/>,
	);
	await userEvent.setup().click(choice("Yearly"));
	expect(onPresetChange).toHaveBeenCalledWith("yearly");
});
