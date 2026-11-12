ALTER TABLE "app"."budgets" ADD CONSTRAINT "budgets_schedule_entries" CHECK (CASE WHEN jsonb_typeof("app"."budgets"."schedule") = 'array'
			THEN jsonb_array_length(jsonb_path_query_array("app"."budgets"."schedule", 'strict $[*] ? (@.type() == "object"
		&& !exists(@.keyvalue() ? (@.key != "from" && @.key != "limitMinor"))
		&& @.from.type() == "string"
		&& @.from like_regex "^[0-9]{4}-(0[1-9]|1[0-2])$"
		&& (@.limitMinor.type() == "null"
			|| (@.limitMinor.type() == "number" && @.limitMinor >= 1
				&& @.limitMinor <= 999999999999 && @.limitMinor.floor() == @.limitMinor)))'::jsonpath,
				'{}', true)) = jsonb_array_length("app"."budgets"."schedule")
			ELSE true END);--> statement-breakpoint
ALTER TABLE "app"."budgets" ADD CONSTRAINT "budgets_overrides_entries" CHECK (CASE WHEN jsonb_typeof("app"."budgets"."overrides") = 'array'
			THEN jsonb_array_length(jsonb_path_query_array("app"."budgets"."overrides", 'strict $[*] ? (@.type() == "object"
		&& !exists(@.keyvalue() ? (@.key != "month" && @.key != "limitMinor"))
		&& @.month.type() == "string"
		&& @.month like_regex "^[0-9]{4}-(0[1-9]|1[0-2])$"
		&& (@.limitMinor.type() == "null"
			|| (@.limitMinor.type() == "number" && @.limitMinor >= 1
				&& @.limitMinor <= 999999999999 && @.limitMinor.floor() == @.limitMinor)))'::jsonpath,
				'{}', true)) = jsonb_array_length("app"."budgets"."overrides")
			ELSE true END);