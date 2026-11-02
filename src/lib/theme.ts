/** Where next-themes keeps the device's choice (BR-F02-21). */
export const THEME_STORAGE_KEY = "daybook.theme";

/** The browser chrome's colour for each theme: the page surface, `--page` in
 * `src/styles/colors.css` (BR-F02-22). A test keeps the two in step. */
export const THEME_COLORS = { light: "#ffffff", dark: "#15171c" } as const;
