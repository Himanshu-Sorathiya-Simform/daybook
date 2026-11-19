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
