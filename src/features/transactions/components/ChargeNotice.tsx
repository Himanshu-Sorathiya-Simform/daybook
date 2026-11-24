"use client";

import { TextLink } from "@/components/navigation/TextLink";
import { chargeNotice, chargeNoticeLink, ENTRY_TEXT } from "../lib/entry";
import type { TransactionAnswer } from "../lib/types";

export type ChargeNoticeProps = {
	/** The charge: a Transaction a Subscription added. */
	row: Pick<TransactionAnswer, "subscriptionId" | "subscription" | "payee">;
};

/**
 * What the entry dialog says in place of Type for a charge a Subscription added (BR-F03-16,
 * D-586): where it comes from, "Added automatically from Netflix", with a link to that
 * Subscription while it is still there.
 */
export function ChargeNotice({ row }: Readonly<ChargeNoticeProps>) {
	const link = chargeNoticeLink(row);
	return (
		<p className="bg-soft rounded-control text-label text-ink-2 px-3 py-2.5">
			{link === null ?
				chargeNotice(row)
			:	<>
					<TextLink href={link.href}>{link.text}</TextLink>
					{`. ${ENTRY_TEXT.chargeLinked}`}
				</>
			}
		</p>
	);
}
