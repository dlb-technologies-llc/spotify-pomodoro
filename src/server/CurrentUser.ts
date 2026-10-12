/**
 * The user a request acts for.
 *
 * @module
 */
import { Context } from "effect";
import { AUTH_USERNAME, type UserName } from "@/shared/domain/Auth";

/**
 * Owner of the data a request reads and writes. The session cookie
 * middleware sets it; without login it is the single default user.
 *
 * @since 2.1.0
 * @category Services
 */
export const CurrentUser = Context.Reference<UserName>(
	"spotify-pomodoro/server/CurrentUser",
	{ defaultValue: () => AUTH_USERNAME },
);
