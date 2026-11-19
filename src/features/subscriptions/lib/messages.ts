import { SUBSCRIPTION_MESSAGES } from "@/lib/subscriptions/messages";

/** F05 section 8's messages that the page writes itself for a refused write, rather than
 * reading from the API's error envelope. The server's own messages arrive in the envelope's
 * `fields` and `message`. */
export const SUBSCRIPTIONS_TEXT = {
	saveFailed:
		"The Subscription could not be saved. Check your connection and try again. Your changes are still here.",
	deleteFailed:
		"The Subscription could not be deleted. Check your connection and try again.",
	noticeFailed:
		"The Subscription could not be saved. Check your connection and try again.",
	deletedElsewhere: SUBSCRIPTION_MESSAGES.notFound,
	cannotUndo: SUBSCRIPTION_MESSAGES.cannotUndo,
} as const;
