"use client";

import { Ellipsis } from "lucide-react";

import { MenuButton } from "@/components/actions/MenuButton";
import { LIST_TEXT } from "../lib/messages";
import type { MenuAction, MenuItem } from "../lib/menu";

export type RowMenuProps = {
	name: string;
	items: readonly MenuItem[];
	onAction: (action: MenuAction) => void;
};

/** A row's "Actions for Netflix" menu (BR-F05-22): the items for its status, in order. React
 * Aria gives the keyboard, and the button's name is its hidden text. */
export function RowMenu({ name, items, onAction }: Readonly<RowMenuProps>) {
	return (
		<MenuButton
			label={LIST_TEXT.actionsFor(name)}
			icon={Ellipsis}
			hideLabel
			align="end"
			items={items.map((item) => ({
				id: item.action,
				label: item.label,
				...(item.danger ? { tone: "danger" as const } : {}),
				onAction: () => onAction(item.action),
			}))}
		/>
	);
}
