/**
 * Database backups.
 *
 * @module
 */
import { Schema } from "effect";

/**
 * A backup file in the backup directory.
 *
 * @since 2.1.0
 * @category Schemas
 */
export class BackupInfo extends Schema.Class<BackupInfo>("BackupInfo")({
	file: Schema.String,
	bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	createdAt: Schema.DateTimeUtcFromMillis,
}) {}

/**
 * Backups, newest first.
 *
 * @since 2.1.0
 * @category Schemas
 */
export const BackupList = Schema.Array(BackupInfo);

/**
 * The database could not be reached.
 *
 * @since 2.1.0
 * @category Errors
 */
export class NotReady extends Schema.TaggedError<NotReady>()(
	"NotReady",
	{ reason: Schema.String },
	{ httpApiStatus: 503 },
) {}
