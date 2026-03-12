/**
 * Web Playback SDK schemas.
 *
 * @module
 */
import { Schema } from "effect";

/**
 * State of the Web Playback SDK device.
 *
 * @since 1.3.0
 * @category Schemas
 */
export class SdkDeviceState extends Schema.Class<SdkDeviceState>(
	"SdkDeviceState",
)({
	deviceId: Schema.String,
	isReady: Schema.Boolean,
	playerName: Schema.String,
}) {}
