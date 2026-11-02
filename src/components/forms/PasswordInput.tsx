"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/actions/IconButton";
import { TextInput, type TextInputProps } from "@/components/forms/TextInput";

export type PasswordInputProps = Omit<
	TextInputProps,
	"type" | "trailing" | "multiline" | "rows" | "icon" | "autoComplete"
> & {
	/** `current-password` to log in, `new-password` to choose one, so password managers fill
	 * or save it (D-510). */
	autoComplete: "current-password" | "new-password";
};

/** A password box with a Show password / Hide password button (F01, D-510). Showing it keeps
 * what was typed; pasting is allowed. */
export function PasswordInput({
	isDisabled,
	...rest
}: Readonly<PasswordInputProps>) {
	const [visible, setVisible] = useState(false);
	return (
		<TextInput
			{...rest}
			{...(isDisabled !== undefined ? { isDisabled } : {})}
			type={visible ? "text" : "password"}
			trailing={
				<IconButton
					icon={visible ? EyeOff : Eye}
					label={visible ? "Hide password" : "Show password"}
					variant="plain"
					size="sm"
					className="-mr-2"
					{...(isDisabled !== undefined ? { isDisabled } : {})}
					onPress={() => setVisible((shown) => !shown)}
				/>
			}
		/>
	);
}
