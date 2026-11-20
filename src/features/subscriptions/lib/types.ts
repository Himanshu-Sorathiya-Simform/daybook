import type { Formats } from "./labels";

/** The answers of F05 section 11's reads and writes, as the routes send them. The types are
 * shared with the data access layer that builds each answer, so the two cannot drift. */
export type {
	CatchUpAnswer,
	SubscriptionAnswer,
	SubscriptionChanged,
	SubscriptionCreated,
	SubscriptionDeleted,
	SubscriptionItem,
	SubscriptionList,
	SubscriptionMonthRow,
	SubscriptionMonthsAnswer,
} from "@/lib/subscriptions/answers";

/** What the page is given by the server render: the profile's formats and its today (TIME-5),
 * and the time zone "as of" is read in. */
export type SubscriptionsLocale = Formats & {
	timezone: string;
};
