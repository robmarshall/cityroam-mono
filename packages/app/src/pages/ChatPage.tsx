import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { useParams, useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogPanel,
  DialogBackdrop,
  DialogTitle,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import { chatMessageSchema, displayNameSchema } from "@cityroam/shared/validation/player";
import { formatTimestamp } from "@cityroam/shared/utils";
import { TYPING_INDICATOR_DEBOUNCE_MS, MAX_MESSAGE_LENGTH, MIN_DISPLAY_NAME_LENGTH, MAX_DISPLAY_NAME_LENGTH } from "@cityroam/shared/constants";
import { POSTHOG_EVENTS } from "@cityroam/shared/analytics";
import type {
  ChatMessagePayload,
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  GameCompletePayload,
  ErrorPayload,
  GuideTypingPayload,
  ParticipantTypingPayload,
  NameChangedPayload,
  LeadChangedPayload,
  MessageHistoryResponse,
  EventDetailResponse,
  MessageDroppedPayload,
  ActionWaitingPayload,
  BlockAdvancedPayload,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { validationMessage } from "../lib/errors";
import { trackEvent } from "../lib/analytics";
import { useParticipant } from "../contexts/ParticipantContext";
import { useEvent } from "../contexts/EventContext";
import {
  useWebSocket,
  REJOIN_CLOSE_CODES,
  fatalCloseReason,
} from "../contexts/WebSocketContext";

// 5-minute gap for timestamp separators
const TIMESTAMP_GAP_MS = 5 * 60 * 1000;

// Max textarea height (~3 lines)
const MAX_INPUT_HEIGHT = 72;

// How long to show the "Connected" banner after reconnecting
const CONNECTED_BANNER_DURATION_MS = 2000;

// A visual-viewport shrink of at least this much means the keyboard opened,
// rather than a URL bar collapsing or an address-bar animation.
const KEYBOARD_OPEN_DELTA_PX = 100;

// iOS reports the post-keyboard viewport slightly after the focus event.
const KEYBOARD_SETTLE_MS = 300;

// How long an error toast stays up
const ERROR_TOAST_DURATION_MS = 4000;

/**
 * How long to wait for the server to echo a sent message back before showing
 * it as failed. The server broadcasts every stored user message to the whole
 * group including the sender, so the echo is the only real delivery receipt —
 * a socket in `OPEN` on a dead radio will happily swallow a frame.
 */
const SEND_ACK_TIMEOUT_MS = 8000;

/**
 * The server mints its own message id and ignores extra fields on the
 * `user_message` frame, so an optimistic bubble is matched to its echo by
 * sender and content. The window keeps an identical message typed much later
 * from stealing an old failed bubble.
 */
const ECHO_MATCH_WINDOW_MS = 60_000;

const LOCAL_ID_PREFIX = "local:";

type PendingState = "sending" | "failed";

/** A message in the transcript, possibly one we optimistically rendered. */
interface ChatMessageItem extends ChatMessagePayload {
  /** Present only while the server has not echoed this message back. */
  pending?: PendingState;
  /** Client clock ms when the frame was last handed to the socket. */
  pendingSentAt?: number;
}

export default function ChatPage() {
  const { t } = useTranslation();

  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { participant, token, setParticipant, clearParticipant } = useParticipant();
  const { event, participants, setEvent, setParticipants, clearEvent } = useEvent();
  const {
    status: wsStatus,
    closeCode,
    maxAttemptsReached,
    isRejected,
    resyncNonce,
    catchUpMessages,
    send,
    subscribe,
    connect,
    disconnect,
    manualRetry,
    clearCatchUpMessages,
    setLastMessageTimestamp,
  } = useWebSocket();

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [guideTyping, setGuideTyping] = useState(false);
  const [participantsTyping, setParticipantsTyping] = useState<Map<string, number>>(new Map());
  const [pendingAction, setPendingAction] = useState<{ block_id: string; label: string } | null>(null);
  const [actionConfirming, setActionConfirming] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const isUserScrolledUpRef = useRef(isUserScrolledUp);
  isUserScrolledUpRef.current = isUserScrolledUp;
  const participantsTypingRef = useRef(participantsTyping);
  participantsTypingRef.current = participantsTyping;
  const participantsRef = useRef(participants);
  participantsRef.current = participants;
  const participantRef = useRef(participant);
  participantRef.current = participant;
  const eventRef = useRef(event);
  eventRef.current = event;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /**
   * Counts how many times the live socket has spoken about the pending-action
   * state. A snapshot fetch only applies if this hasn't moved while it was in
   * flight — the stream is newer than any HTTP response it races.
   */
  const actionStreamSeqRef = useRef(0);
  const wasReconnectingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const errorToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Assigned below — lets the socket subscription reach the toast helper. */
  const showErrorRef = useRef<(message: string) => void>(() => {});
  /** Ack timers for optimistic messages, keyed by their local id. */
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Guard: redirect to join if no session context
  useEffect(() => {
    if (!participant || !event || !code) {
      navigate(`/event/${code ?? ""}`, { replace: true });
    }
  }, [participant, event, code, navigate]);

  // Disconnect WebSocket when ChatPage unmounts (e.g. back navigation)
  useEffect(() => {
    return () => {
      // Only disconnect if not navigating to the complete page
      // (CompletePage handles its own disconnect)
      if (window.location.pathname.includes("/complete")) return;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect WebSocket if we landed here directly (e.g. auto-rejoin of IN_PROGRESS event)
  // Use a ref to avoid re-running when `connect` reference changes across renders.
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    if (code && token && wsStatus === "disconnected" && !isRejected && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connectRef.current(code, token);
    }
  }, [code, token, wsStatus, isRejected]);

  // Load full message history on mount (covers auto-rejoin where no messages are in state)
  useEffect(() => {
    if (!code || !token) return;
    let cancelled = false;

    async function loadHistory() {
      // Fixed before the request so an empty transcript still gives catch-up
      // a watermark to ask from.
      const fetchedAt = new Date().toISOString();
      try {
        const response = await api.get<MessageHistoryResponse>(
          `/event/${encodeURIComponent(code!)}/messages`,
        );
        if (cancelled) return;
        // Seed the catch-up watermark. Without this a reconnect after a page
        // refresh has no `since` value and skips catch-up altogether, so
        // everything sent during the outage is lost from the transcript.
        const newest = response.messages[response.messages.length - 1];
        setLastMessageTimestamp(newest ? newest.created_at : fetchedAt);
        if (response.messages.length === 0) return;
        setMessages((prev) => {
          if (prev.length > 0) return prev; // Don't overwrite if messages already loaded
          return response.messages;
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          navigate(`/event/${code}`, { replace: true });
          return;
        }
        // Non-fatal — messages will arrive via WebSocket
      }
    }

    loadHistory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, token]);

  // Rebuild the pending action prompt on mount. action_waiting is broadcast
  // once, so a reload while the hunt waits on the lead would otherwise leave
  // nobody able to confirm.
  useEffect(() => {
    if (!code || !token) return;
    let cancelled = false;
    const streamSeq = actionStreamSeqRef.current;

    async function loadPendingAction() {
      try {
        const detail = await api.get<EventDetailResponse>(
          `/event/${encodeURIComponent(code!)}`,
        );
        // The live stream is authoritative — if it has already said anything
        // about the action state, don't overwrite it with this snapshot.
        if (cancelled || actionStreamSeqRef.current !== streamSeq) return;
        if (detail.pending_action) {
          setPendingAction(detail.pending_action);
        }
      } catch {
        // Non-fatal — action_waiting will arrive over the socket if it fires again
      }
    }

    loadPendingAction();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, token]);

  // Re-read game state after every reconnect.
  //
  // action_waiting, block_advanced and game_complete are broadcast once and
  // never replayed. A group that was offline when one fired would otherwise
  // sit forever on a screen that no longer matches the server: no confirm
  // button, or a confirm button for a block that already advanced. Message
  // catch-up (handled by the socket context) does not cover any of that.
  useEffect(() => {
    if (resyncNonce === 0 || !code) return;
    let cancelled = false;
    const streamSeq = actionStreamSeqRef.current;

    async function resync() {
      try {
        const detail = await api.get<EventDetailResponse>(
          `/event/${encodeURIComponent(code!)}`,
        );
        if (cancelled) return;

        if (detail.event.status === "COMPLETED") {
          navigate(`/event/${code}/complete`, { replace: true });
          return;
        }
        if (detail.event.status === "EXPIRED" || detail.event.status === "REFUNDED") {
          navigate(`/event/${code}`, { replace: true });
          return;
        }

        setEvent({
          code: detail.event.code,
          status: detail.event.status,
          current_stop: detail.event.current_stop,
          language: detail.event.language,
        });
        setParticipants(detail.participants);
        if (detail.current_participant) {
          setParticipant(detail.current_participant);
        }

        // Skip if the socket has spoken about the action while this was in
        // flight — the live frame is newer than this snapshot.
        if (actionStreamSeqRef.current !== streamSeq) return;
        setPendingAction(detail.pending_action);
        if (!detail.pending_action) setActionConfirming(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          navigate(`/event/${code}`, { replace: true });
        }
        // Otherwise non-fatal — the next reconnect tries again
      }
    }

    resync();
    return () => { cancelled = true; };
  }, [resyncNonce, code, navigate, setEvent, setParticipants, setParticipant]);

  // Handle close codes — leave the chat with an explanation. Fatal codes are
  // terminal, so staying here would just show a dead screen with no way back.
  useEffect(() => {
    if (closeCode === null || !code) return;
    if (REJOIN_CLOSE_CODES.has(closeCode)) {
      navigate(`/event/${code}`, {
        replace: true,
        state: { sessionExpired: true },
      });
      return;
    }
    const reason = fatalCloseReason(closeCode);
    if (reason) {
      navigate(`/event/${code}`, {
        replace: true,
        state: { disconnectedReason: reason },
      });
    }
  }, [closeCode, code, navigate]);

  // Track reconnecting → connected transition for banner
  useEffect(() => {
    if (wsStatus === "reconnecting") {
      wasReconnectingRef.current = true;
    } else if (wsStatus === "connected" && wasReconnectingRef.current) {
      wasReconnectingRef.current = false;
      setShowConnectedBanner(true);
      const timer = setTimeout(() => setShowConnectedBanner(false), CONNECTED_BANNER_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [wsStatus]);

  // Process catch-up messages from reconnection
  useEffect(() => {
    if (catchUpMessages.length === 0) return;

    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newMessages = catchUpMessages.filter((m) => !existingIds.has(m.id));
      if (newMessages.length === 0) return prev;

      // A message sent just before the drop did reach the server, so its real
      // copy comes back through catch-up rather than the live socket. Promote
      // the optimistic bubble instead of leaving a "not sent" duplicate.
      const myId = participantRef.current?.id ?? null;
      const now = Date.now();
      const next = prev.slice();
      const appended: ChatMessageItem[] = [];

      for (const incoming of newMessages) {
        let promoted = false;
        if (myId && incoming.participant_id === myId) {
          const index = next.findIndex(
            (m) =>
              m.pending !== undefined &&
              m.content === incoming.content &&
              now - (m.pendingSentAt ?? 0) < ECHO_MATCH_WINDOW_MS,
          );
          if (index !== -1) {
            next[index] = incoming;
            promoted = true;
          }
        }
        if (!promoted) appended.push(incoming);
      }

      return appended.length > 0 ? [...next, ...appended] : next;
    });

    clearCatchUpMessages();
  }, [catchUpMessages, clearCatchUpMessages]);

  // Handle incoming WebSocket messages via subscription (no batching risk)
  useEffect(() => {
    const unsubscribe = subscribe((msg) => {
      switch (msg.type) {
        case "chat_message": {
          const payload = msg.payload as ChatMessagePayload;
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.id)) return prev;

            // Our own message coming back is the delivery receipt. Swap the
            // optimistic bubble for the real one instead of showing both.
            const myId = participantRef.current?.id ?? null;
            if (myId && payload.participant_id === myId) {
              const now = Date.now();
              const index = prev.findIndex(
                (m) =>
                  m.pending !== undefined &&
                  m.content === payload.content &&
                  now - (m.pendingSentAt ?? 0) < ECHO_MATCH_WINDOW_MS,
              );
              if (index !== -1) {
                const next = prev.slice();
                next[index] = payload;
                return next;
              }
            }

            return [...prev, payload];
          });

          if (isUserScrolledUpRef.current) {
            setHasNewMessages(true);
          }
          break;
        }
        case "message_dropped": {
          const payload = msg.payload as MessageDroppedPayload;
          setMessages((prev) => prev.filter((m) => m.id !== payload.message_id));
          break;
        }
        case "participant_joined": {
          const payload = msg.payload as ParticipantJoinedPayload;
          setMessages((prev) => [
            ...prev,
            makeSystemMessage(i18n.t("chat.participantJoined", { name: payload.name })),
          ]);
          break;
        }
        case "participant_left": {
          const payload = msg.payload as ParticipantLeftPayload;
          setMessages((prev) => [
            ...prev,
            makeSystemMessage(i18n.t("chat.participantLeft", { name: payload.name })),
          ]);
          setParticipantsTyping((prev) => {
            const existingTimer = prev.get(payload.name);
            if (existingTimer == null) return prev;
            clearTimeout(existingTimer);
            const next = new Map(prev);
            next.delete(payload.name);
            return next;
          });
          break;
        }
        case "name_changed": {
          const payload = msg.payload as NameChangedPayload;
          setMessages((prev) => [
            ...prev,
            makeSystemMessage(
              i18n.t("chat.nameChanged", { oldName: payload.old_name, newName: payload.new_name })
            ),
          ]);
          setParticipantsTyping((prev) => {
            const existingTimer = prev.get(payload.old_name);
            if (existingTimer == null) return prev;
            const next = new Map(prev);
            next.delete(payload.old_name);
            next.set(payload.new_name, existingTimer);
            return next;
          });
          break;
        }
        case "lead_changed": {
          const payload = msg.payload as LeadChangedPayload;
          setParticipants(
            participantsRef.current.map((p) => ({
              ...p,
              is_lead: p.id === payload.participant_id,
            })),
          );
          const me = participantRef.current;
          if (me) {
            setParticipant({ ...me, is_lead: me.id === payload.participant_id });
          }
          setMessages((prev) => [
            ...prev,
            makeSystemMessage(i18n.t("chat.leadChanged", { name: payload.name })),
          ]);
          break;
        }
        case "game_complete": {
          const payload = msg.payload as GameCompletePayload;
          navigate(`/event/${code}/complete`, {
            replace: true,
            state: { summary: payload.summary },
          });
          break;
        }
        case "guide_typing": {
          const payload = msg.payload as GuideTypingPayload;
          setGuideTyping(payload.is_typing);
          break;
        }
        case "participant_typing": {
          const payload = msg.payload as ParticipantTypingPayload;
          setParticipantsTyping((prev) => {
            const next = new Map(prev);
            if (payload.is_typing) {
              const existingTimer = next.get(payload.name);
              if (existingTimer) clearTimeout(existingTimer);
              const timer = window.setTimeout(() => {
                setParticipantsTyping((p) => {
                  const updated = new Map(p);
                  updated.delete(payload.name);
                  return updated;
                });
              }, TYPING_INDICATOR_DEBOUNCE_MS + 500);
              next.set(payload.name, timer);
            } else {
              const existingTimer = next.get(payload.name);
              if (existingTimer) clearTimeout(existingTimer);
              next.delete(payload.name);
            }
            return next;
          });
          break;
        }
        case "action_waiting": {
          const payload = msg.payload as ActionWaitingPayload;
          actionStreamSeqRef.current += 1;
          setPendingAction({ block_id: payload.block_id, label: payload.label });
          break;
        }
        case "block_advanced": {
          // The only thing that genuinely resolves the prompt. Guide chatter
          // must not clear it — another player asking a question would
          // otherwise take the confirm button away from the lead.
          const payload = msg.payload as BlockAdvancedPayload;
          actionStreamSeqRef.current += 1;
          setPendingAction((prev) =>
            prev?.block_id === payload.block_id ? null : prev,
          );
          setActionConfirming(false);
          break;
        }
        case "error": {
          const payload = msg.payload as ErrorPayload;
          setActionConfirming(false);
          showErrorRef.current(validationMessage(payload.code ?? payload.message));
          break;
        }
      }
    });

    return unsubscribe;
  }, [subscribe, code, navigate, setParticipants, setParticipant]);

  // Auto-scroll to bottom on new messages or typing indicators (unless user has scrolled up)
  useEffect(() => {
    if (!isUserScrolledUp && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, guideTyping, participantsTyping, isUserScrolledUp]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsUserScrolledUp(!isAtBottom);
    if (isAtBottom) {
      setHasNewMessages(false);
    }
  }, []);

  // Visual Viewport API for mobile keyboard.
  //
  // iOS does not shrink the layout viewport when the keyboard opens; it scrolls
  // the layout viewport instead and reports the shift as `offsetTop`. Sizing the
  // container from `height` alone therefore leaves it pinned to the top of the
  // document, which pushes the input under the keyboard. Match both the size and
  // the offset so the container always covers exactly the visible area.
  const syncViewportToKeyboard = useCallback(() => {
    const viewport = window.visualViewport;
    const container = chatContainerRef.current;
    if (!viewport || !container) return;

    container.style.height = `${viewport.height}px`;
    const offsetTop = viewport.offsetTop;
    container.style.transform =
      offsetTop > 0 ? `translateY(${offsetTop}px)` : "";
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let lastHeight = viewport.height;

    const handleViewportChange = () => {
      syncViewportToKeyboard();

      const keyboardOpened =
        viewport.height < lastHeight - KEYBOARD_OPEN_DELTA_PX;
      lastHeight = viewport.height;

      // Keep the newest message and the input in view as the keyboard appears.
      if (keyboardOpened && !isUserScrolledUpRef.current) {
        messagesEndRef.current?.scrollIntoView({ block: "end" });
      }
    };

    viewport.addEventListener("resize", handleViewportChange);
    viewport.addEventListener("scroll", handleViewportChange);
    syncViewportToKeyboard();

    return () => {
      viewport.removeEventListener("resize", handleViewportChange);
      viewport.removeEventListener("scroll", handleViewportChange);
      const container = chatContainerRef.current;
      if (container) container.style.transform = "";
    };
  }, [syncViewportToKeyboard]);

  // Focusing the textarea is what opens the keyboard, but iOS reports the new
  // viewport a beat later — re-sync once it has settled so the input stays put.
  const handleInputFocus = useCallback(() => {
    if (!window.visualViewport) return;
    window.setTimeout(() => {
      syncViewportToKeyboard();
      if (!isUserScrolledUpRef.current) {
        messagesEndRef.current?.scrollIntoView({ block: "end" });
      } else {
        inputRef.current?.scrollIntoView({ block: "nearest" });
      }
    }, KEYBOARD_SETTLE_MS);
  }, [syncViewportToKeyboard]);

  // Send typing_start/typing_stop with debounce
  const sendTypingStop = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      send({ type: "typing_stop", payload: {} });
    }
  }, [send]);

  const handleTypingActivity = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      send({ type: "typing_start", payload: {} });
    }
    // Reset the debounce timer
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(sendTypingStop, TYPING_INDICATOR_DEBOUNCE_MS);
  }, [send, sendTypingStop]);

  // Cleanup timers on unmount
  useEffect(() => {
    const pendingTimers = pendingTimersRef.current;
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (errorToastTimerRef.current) clearTimeout(errorToastTimerRef.current);
      participantsTypingRef.current.forEach((timer) => clearTimeout(timer));
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
    };
  }, []);

  const showError = useCallback((message: string) => {
    setErrorToast(message);
    if (errorToastTimerRef.current) clearTimeout(errorToastTimerRef.current);
    errorToastTimerRef.current = setTimeout(
      () => setErrorToast(null),
      ERROR_TOAST_DURATION_MS,
    );
  }, []);

  showErrorRef.current = showError;

  /**
   * Start (or restart) the delivery deadline for an optimistic message. If it
   * has been promoted by then its local id is gone from the list, so the
   * update is a harmless no-op.
   */
  const armSendTimeout = useCallback((localId: string) => {
    const timers = pendingTimersRef.current;
    const existing = timers.get(localId);
    if (existing) clearTimeout(existing);
    timers.set(
      localId,
      setTimeout(() => {
        timers.delete(localId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localId && m.pending === "sending" ? { ...m, pending: "failed" } : m,
          ),
        );
      }, SEND_ACK_TIMEOUT_MS),
    );
  }, []);

  // A dropped socket is immediate proof that anything still in flight is not
  // going to be acknowledged — don't make the player wait out the deadline.
  useEffect(() => {
    if (wsStatus === "connected" || wsStatus === "connecting") return;
    setMessages((prev) => {
      if (!prev.some((m) => m.pending === "sending")) return prev;
      return prev.map((m) => (m.pending === "sending" ? { ...m, pending: "failed" } : m));
    });
  }, [wsStatus]);

  // Send message
  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    const result = chatMessageSchema.safeParse(trimmed);
    if (!result.success) return;

    const me = participantRef.current;
    if (!me) return;

    const sent = send({ type: "user_message", payload: { text: trimmed } });
    if (!sent) {
      // The input is deliberately left intact — the player keeps their text
      // and can send it again once the socket is back.
      showError(t("chat.offlineError"));
      return;
    }

    // Handed to an OPEN socket, which is not the same as delivered. Render it
    // as pending until the server echoes it back.
    const localId = `${LOCAL_ID_PREFIX}${crypto.randomUUID()}`;
    const sentAt = Date.now();
    setMessages((prev) => [
      ...prev,
      {
        id: localId,
        sender_type: "user",
        sender_name: me.display_name,
        participant_id: me.id,
        content: trimmed,
        image_url: null,
        step_number: eventRef.current?.current_stop ?? 0,
        created_at: new Date(sentAt).toISOString(),
        pending: "sending",
        pendingSentAt: sentAt,
      },
    ]);
    armSendTimeout(localId);

    setInputText("");
    sendTypingStop();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [inputText, send, sendTypingStop, showError, armSendTimeout, t]);

  // Retry a message the server never acknowledged
  const handleRetrySend = useCallback(
    (localId: string) => {
      const target = messagesRef.current.find((m) => m.id === localId);
      if (!target || target.pending !== "failed") return;

      const sent = send({ type: "user_message", payload: { text: target.content } });
      if (!sent) {
        showError(t("chat.offlineError"));
        return;
      }

      const sentAt = Date.now();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localId ? { ...m, pending: "sending", pendingSentAt: sentAt } : m,
        ),
      );
      armSendTimeout(localId);
    },
    [send, showError, armSendTimeout, t],
  );

  // Handle keyboard input
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (e.target.value.trim()) {
      handleTypingActivity();
    }
    const textarea = e.target;
    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, MAX_INPUT_HEIGHT);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
  };

  // Scroll to bottom on pill click
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessages(false);
  };

  // Confirm action block. The prompt stays up until the server says the
  // block actually advanced (block_advanced) — clearing it optimistically
  // would strand the group if the confirm were refused.
  const handleActionConfirm = useCallback(() => {
    if (!pendingAction || actionConfirming) return;

    // Confirm only counts if it actually reached the socket. Failing silently
    // here leaves the whole group parked on a block nobody can advance.
    const sent = send({ type: "action_confirm", payload: { block_id: pendingAction.block_id } });
    if (!sent) {
      showError(t("chat.actionOfflineError"));
      return;
    }

    setActionConfirming(true);
    // Safety net in case neither block_advanced nor an error arrives
    setTimeout(() => setActionConfirming(false), 5000);
  }, [pendingAction, actionConfirming, send, showError, t]);

  // Leave game
  const handleLeave = useCallback(async () => {
    if (!code || leaving) return;
    setLeaving(true);
    try {
      await api.post(`/event/${code}/leave`);
      trackEvent(POSTHOG_EVENTS.GAME_ABANDONED, {
        event_code: code,
        current_stop: event?.current_stop ?? 1,
        duration_minutes: 0,
      });
    } catch {
      // Best-effort — proceed with local cleanup regardless
    }
    disconnect();
    clearParticipant();
    clearEvent();
    navigate(`/event/${code}`, { replace: true });
  }, [code, leaving, event, disconnect, clearParticipant, clearEvent, navigate]);

  // Change display name
  const openNameDialog = useCallback(() => {
    if (!participant) return;
    setNameInput(participant.display_name);
    setNameError(null);
    setShowNameDialog(true);
  }, [participant]);

  const handleChangeName = useCallback(async () => {
    if (!code || savingName) return;
    const trimmed = nameInput.trim();
    const result = displayNameSchema.safeParse(trimmed);
    if (!result.success) {
      setNameError(validationMessage(result.error.issues[0]?.message ?? "DISPLAY_NAME_TOO_SHORT"));
      return;
    }
    if (participant && trimmed === participant.display_name) {
      setShowNameDialog(false);
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await api.post<{ success: boolean; display_name: string }>(
        `/event/${code}/name`,
        { name: trimmed },
      );
      if (participant) {
        setParticipant({ ...participant, display_name: trimmed });
      }
      setShowNameDialog(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setNameError(err.message);
      } else {
        setNameError(t("chat.nameChangeError"));
      }
    } finally {
      setSavingName(false);
    }
  }, [code, nameInput, savingName, participant, setParticipant]);

  if (!participant || !event || !code) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white">
        <p className="text-system-text">{t("common.loading")}</p>
      </div>
    );
  }

  const isValidMessage = chatMessageSchema.safeParse(inputText.trim()).success;

  return (
    <div ref={chatContainerRef} className="flex h-svh flex-col bg-white">
      {/* Header with menu */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold text-gray-900">{t("chat.headerTitle")}</h1>
        <Menu as="div" className="relative">
          <MenuButton className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label={t("chat.optionsMenu")}>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </MenuButton>
          <MenuItems
            transition
            className="absolute right-0 z-30 mt-1 w-40 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black/5 transition duration-100 data-[closed]:scale-95 data-[closed]:opacity-0"
          >
            <MenuItem>
              <button
                onClick={openNameDialog}
                className="flex w-full items-center px-4 py-2.5 text-sm text-gray-700 data-[focus]:bg-gray-50"
              >
                {t("chat.changeName")}
              </button>
            </MenuItem>
            <MenuItem>
              <button
                onClick={() => setShowLeaveDialog(true)}
                className="flex w-full items-center px-4 py-2.5 text-sm text-red-600 data-[focus]:bg-gray-50"
              >
                {t("chat.leaveGame")}
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>

      {/* Connection status banners */}
      {wsStatus === "reconnecting" && !maxAttemptsReached && (
        <div className="shrink-0 bg-yellow-400 px-4 py-1.5 text-center text-sm font-medium text-yellow-900">
          {t("common.reconnecting")}
        </div>
      )}
      {showConnectedBanner && wsStatus === "connected" && (
        <div className="shrink-0 bg-green-500 px-4 py-1.5 text-center text-sm font-medium text-white">
          {t("common.connected")}
        </div>
      )}
      {maxAttemptsReached && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-red-500 px-4 py-2 text-center text-sm font-medium text-white">
          <span>{t("common.unableToReconnect")}</span>
          <button
            onClick={manualRetry}
            className="rounded-md bg-white/20 px-3 py-0.5 text-sm font-semibold hover:bg-white/30"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* Error toast */}
      {errorToast && (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {errorToast}
        </div>
      )}

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 pb-2 pt-3"
      >
        {messages.map((msg, i) => (
          <MessageRow
            key={msg.id}
            message={msg}
            prevMessage={i > 0 ? messages[i - 1] : null}
            isSelf={msg.participant_id === participant.id}
            isFirstInGuideSequence={
              msg.sender_type === "guide" &&
              (i === 0 || messages[i - 1].sender_type !== "guide")
            }
            onImageClick={setFullscreenImage}
            onRetrySend={handleRetrySend}
          />
        ))}

        {/* Guide typing indicator — pulsing dots in guide bubble */}
        {guideTyping && (
          <div className="mb-chat-gap flex justify-start">
            <div className="max-w-[75%]">
              <div className="mb-0.5 flex items-center gap-1 text-xs text-system-text">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <span>{t("chat.guideLabel")}</span>
              </div>
              <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm bg-bubble-guide px-4 py-3">
                <span className="typing-dot inline-block h-2 w-2 rounded-full bg-gray-500" />
                <span className="typing-dot inline-block h-2 w-2 rounded-full bg-gray-500" />
                <span className="typing-dot inline-block h-2 w-2 rounded-full bg-gray-500" />
              </div>
            </div>
          </div>
        )}

        {/* Participant typing indicator */}
        {participantsTyping.size > 0 && (
          <div className="mb-1 px-1 text-xs text-system-text">
            {participantsTyping.size === 1
              ? t("chat.typingOne", { name: [...participantsTyping.keys()][0] })
              : t("chat.typingMultiple")}
          </div>
        )}

        {pendingAction && (
          <div className="mb-chat-gap flex justify-start">
            <div className="max-w-[75%]">
              {participant.is_lead ? (
                <button
                  onClick={handleActionConfirm}
                  disabled={actionConfirming}
                  className="flex items-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {pendingAction.label}
                </button>
              ) : (
                <div className="rounded-2xl rounded-bl-sm bg-bubble-guide px-4 py-2.5 text-sm text-gray-500 italic">
                  {participants.find(p => p.is_lead)?.display_name
                    ? t("chat.waitingForLead", { name: participants.find(p => p.is_lead)!.display_name })
                    : t("chat.waitingForLeadDefault")}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* New messages pill */}
      {hasNewMessages && (
        <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2">
          <button
            onClick={scrollToBottom}
            className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg"
          >
            {t("chat.newMessages")}
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            placeholder={t("chat.inputPlaceholder")}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            className="flex-1 resize-none overflow-hidden rounded-2xl border border-gray-300 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            style={{ maxHeight: `${MAX_INPUT_HEIGHT}px` }}
          />
          <button
            onClick={handleSend}
            disabled={!isValidMessage}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            aria-label={t("chat.sendAriaLabel")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Leave confirmation dialog */}
      <Dialog
        open={showLeaveDialog}
        onClose={() => !leaving && setShowLeaveDialog(false)}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/40" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {t("chat.leaveDialog.title")}
            </DialogTitle>
            <p className="mt-2 text-sm text-gray-600">
              {t("chat.leaveDialog.message")}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowLeaveDialog(false)}
                disabled={leaving}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {leaving ? t("chat.leaveDialog.leaving") : t("chat.leaveDialog.leaveButton")}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Change name dialog */}
      <Dialog
        open={showNameDialog}
        onClose={() => !savingName && setShowNameDialog(false)}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/40" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {t("chat.nameDialog.title")}
            </DialogTitle>
            <div className="mt-3">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setNameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleChangeName();
                  }
                }}
                minLength={MIN_DISPLAY_NAME_LENGTH}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder={t("chat.nameDialog.placeholder")}
                autoFocus
              />
              {nameError && (
                <p className="mt-1.5 text-xs text-red-600">{nameError}</p>
              )}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowNameDialog(false)}
                disabled={savingName}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleChangeName}
                disabled={savingName}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savingName ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Fullscreen image overlay */}
      <Dialog
        open={fullscreenImage !== null}
        onClose={() => setFullscreenImage(null)}
        className="relative z-50"
      >
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/80 transition-opacity duration-200 data-[closed]:opacity-0"
        />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel
            transition
            className="relative transition-all duration-200 data-[closed]:scale-95 data-[closed]:opacity-0"
          >
            <button
              onClick={() => setFullscreenImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
              aria-label={t("chat.closeAriaLabel")}
            >
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
            {fullscreenImage && (
              <img
                src={fullscreenImage}
                alt=""
                className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
              />
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageRow — renders a single message with optional timestamp separator
// ---------------------------------------------------------------------------

interface MessageRowProps {
  message: ChatMessageItem;
  prevMessage: ChatMessageItem | null;
  isSelf: boolean;
  isFirstInGuideSequence: boolean;
  onImageClick: (url: string) => void;
  onRetrySend: (localId: string) => void;
}

function MessageRow({
  message,
  prevMessage,
  isSelf,
  isFirstInGuideSequence,
  onImageClick,
  onRetrySend,
}: MessageRowProps) {
  const showTimestamp =
    !prevMessage ||
    new Date(message.created_at).getTime() -
      new Date(prevMessage.created_at).getTime() >=
      TIMESTAMP_GAP_MS;

  return (
    <>
      {showTimestamp && (
        <div className="my-3 text-center text-xs text-system-text">
          {formatTimestamp(new Date(message.created_at))}
        </div>
      )}

      {message.sender_type === "system" ? (
        <SystemMessage content={message.content} />
      ) : isSelf ? (
        <SelfBubble
          message={message}
          onImageClick={onImageClick}
          onRetrySend={onRetrySend}
        />
      ) : message.sender_type === "guide" ? (
        <GuideBubble
          message={message}
          showLabel={isFirstInGuideSequence}
          onImageClick={onImageClick}
        />
      ) : (
        <OtherBubble message={message} onImageClick={onImageClick} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Bubble components
// ---------------------------------------------------------------------------

function SystemMessage({ content }: { content: string }) {
  return (
    <div className="my-2 text-center text-sm text-system-text">{content}</div>
  );
}

function SelfBubble({
  message,
  onImageClick,
  onRetrySend,
}: {
  message: ChatMessageItem;
  onImageClick: (url: string) => void;
  onRetrySend: (localId: string) => void;
}) {
  const { t } = useTranslation();
  const isSending = message.pending === "sending";
  const hasFailed = message.pending === "failed";

  return (
    <div className="mb-chat-gap flex flex-col items-end">
      <div
        className={`max-w-[75%] rounded-2xl rounded-br-sm bg-bubble-self px-3 py-2 text-white ${
          message.pending ? "opacity-60" : ""
        }`}
      >
        <p className="whitespace-pre-wrap break-words"><Linkify text={message.content} /></p>
        <MessageImage url={message.image_url} onClick={onImageClick} />
      </div>
      {isSending && (
        <span className="mt-0.5 pr-1 text-xs text-system-text">
          {t("chat.sending")}
        </span>
      )}
      {hasFailed && (
        <button
          onClick={() => onRetrySend(message.id)}
          aria-label={t("chat.retryAriaLabel")}
          className="mt-0.5 flex items-center gap-1 pr-1 text-xs font-medium text-red-600 hover:text-red-700"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          {t("chat.sendFailed")}
        </button>
      )}
    </div>
  );
}

function GuideBubble({
  message,
  showLabel,
  onImageClick,
}: {
  message: ChatMessagePayload;
  showLabel: boolean;
  onImageClick: (url: string) => void;
}) {
  const { t } = useTranslation();
  const isMap = message.block_type === "map";

  return (
    <div className="mb-chat-gap flex justify-start">
      <div className="max-w-[75%]">
        {showLabel && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-system-text">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <span>{t("chat.guideLabel")}</span>
          </div>
        )}
        {isMap ? (
          <a
            href={message.content}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl rounded-bl-sm bg-bubble-guide px-4 py-3 text-gray-900 transition-colors hover:bg-gray-200"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
            </div>
            <div className="min-w-0">
              <span className="text-sm font-medium">{t("chat.viewOnMaps")}</span>
              <span className="block truncate text-xs text-gray-500">{message.content}</span>
            </div>
            <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ) : (
          <div className="rounded-2xl rounded-bl-sm bg-bubble-guide px-3 py-2 text-gray-900">
            <p className="whitespace-pre-wrap break-words"><Linkify text={message.content} /></p>
            <MessageImage url={message.image_url} onClick={onImageClick} />
          </div>
        )}
      </div>
    </div>
  );
}

function OtherBubble({
  message,
  onImageClick,
}: {
  message: ChatMessagePayload;
  onImageClick: (url: string) => void;
}) {
  return (
    <div className="mb-chat-gap flex justify-start">
      <div className="max-w-[75%]">
        <div className="mb-0.5 text-xs text-system-text">
          {message.sender_name}
        </div>
        <div className="rounded-2xl rounded-bl-sm bg-bubble-other px-3 py-2 text-gray-900">
          <p className="whitespace-pre-wrap break-words"><Linkify text={message.content} /></p>
          <MessageImage url={message.image_url} onClick={onImageClick} />
        </div>
      </div>
    </div>
  );
}

function MessageImage({
  url,
  onClick,
}: {
  url: string | null;
  onClick: (url: string) => void;
}) {
  if (!url) return null;
  return (
    <button onClick={() => onClick(url)} className="mt-1 block">
      <img
        src={url}
        alt=""
        className="max-w-[280px] rounded-xl"
        loading="lazy"
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Linkify — detect URLs and render as clickable links
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

function Linkify({ text }: { text: string }) {
  if (!text) return null;

  const parts: (string | { url: string; key: number })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  const regex = new RegExp(URL_REGEX.source, "g");
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ url: match[0], key: keyCounter++ });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 1 && typeof parts[0] === "string") {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part) =>
        typeof part === "string" ? (
          part
        ) : (
          <a
            key={part.key}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
          >
            {part.url}
          </a>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSystemMessage(content: string): ChatMessagePayload {
  return {
    id: crypto.randomUUID(),
    sender_type: "system",
    sender_name: "",
    participant_id: null,
    content,
    image_url: null,
    step_number: 0,
    created_at: new Date().toISOString(),
  };
}
