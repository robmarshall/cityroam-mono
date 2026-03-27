// Re-export client
export { redis, redisSub, disconnectRedis } from "./client.js";

// Re-export session store
export {
  setSession,
  getSession,
  deleteSession,
  type SessionData,
} from "./session.js";

// Re-export chat cache
export {
  appendMessage,
  getMessages,
  getMessagesSince,
  removeMessage,
} from "./chat-cache.js";

// Re-export rate limiting
export {
  checkJoinRateLimit,
  checkGuideRateLimit,
  checkParticipantRateLimit,
} from "./rate-limit.js";

// Re-export pub/sub
export {
  incomingChannel,
  messagesChannel,
  typingChannel,
  controlChannel,
  extractEventCode,
  publishIncoming,
  publishMessage,
  publishTyping,
  publishControl,
  subscribeToIncomingPattern,
  subscribeToEvent,
  unsubscribeFromEvent,
  type MessageHandler,
} from "./pubsub.js";
