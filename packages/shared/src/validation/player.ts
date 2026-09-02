/**
 * Player-facing validation schemas.
 *
 * Deliberately free of `admin-input.js`: the player app imports this entry so
 * its bundle never pulls in the (much larger) admin schema tree.
 */

export {
  displayNameSchema,
  chatMessageSchema,
  eventCodeSchema,
} from "./user-input.js";

export {
  joinEventRequestSchema,
  startEventRequestSchema,
  changeNameRequestSchema,
} from "./api-requests.js";
