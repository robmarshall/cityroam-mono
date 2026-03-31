import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
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
import { chatMessageSchema, displayNameSchema } from "@cityroam/shared/validation";
import { formatTimestamp } from "@cityroam/shared/utils";
import { TYPING_INDICATOR_DEBOUNCE_MS, MAX_MESSAGE_LENGTH } from "@cityroam/shared/constants";
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
  MessageHistoryResponse,
  MessageDroppedPayload,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { trackEvent } from "../lib/analytics";
import { useParticipant } from "../contexts/ParticipantContext";
import { useEvent } from "../contexts/EventContext";
import {
  useWebSocket,
  REJOIN_CLOSE_CODES,
  FATAL_CLOSE_CODES,
} from "../contexts/WebSocketContext";

// 5-minute gap for timestamp separators
const TIMESTAMP_GAP_MS = 5 * 60 * 1000;

// Max textarea height (~3 lines)
const MAX_INPUT_HEIGHT = 72;

// How long to show the "Connected" banner after reconnecting
const CONNECTED_BANNER_DURATION_MS = 2000;

const FATAL_CLOSE_MESSAGES: Record<number, string> = {
  4003: "Event not found.",
  4004: "This event has ended.",
  4005: "You are no longer active in this event.",
};

export default function ChatPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { participant, token, setParticipant, clearParticipant } = useParticipant();
  const { event, clearEvent } = useEvent();
  const {
    status: wsStatus,
    closeCode,
    maxAttemptsReached,
    catchUpMessages,
    send,
    subscribe,
    connect,
    disconnect,
    manualRetry,
    clearCatchUpMessages,
  } = useWebSocket();

  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [inputText, setInputText] = useState("");
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [guideTyping, setGuideTyping] = useState(false);
  const [participantsTyping, setParticipantsTyping] = useState<Map<string, number>>(new Map());
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
  const wasReconnectingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

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

  // Connect WebSocket if we landed here directly (e.g. auto-rejoin of IN_PROGRESS event)
  // Use a ref to avoid re-running when `connect` reference changes across renders.
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    if (code && token && wsStatus === "disconnected" && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connectRef.current(code, token);
    }
  }, [code, token, wsStatus]);

  // Load full message history on mount (covers auto-rejoin where no messages are in state)
  useEffect(() => {
    if (!code || !token) return;
    let cancelled = false;

    async function loadHistory() {
      try {
        const response = await api.get<MessageHistoryResponse>(
          `/event/${encodeURIComponent(code!)}/messages`,
        );
        if (cancelled || response.messages.length === 0) return;
        setMessages((prev) => {
          if (prev.length > 0) return prev; // Don't overwrite if messages already loaded
          return response.messages;
        });
      } catch {
        // Non-fatal — messages will arrive via WebSocket
      }
    }

    loadHistory();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, token]);

  // Handle close codes — redirect to join on auth failure
  useEffect(() => {
    if (closeCode === null || !code) return;
    if (REJOIN_CLOSE_CODES.has(closeCode)) {
      navigate(`/event/${code}`, { replace: true });
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
      return [...prev, ...newMessages];
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
            makeSystemMessage(`${payload.name} joined the game`),
          ]);
          break;
        }
        case "participant_left": {
          const payload = msg.payload as ParticipantLeftPayload;
          setMessages((prev) => [
            ...prev,
            makeSystemMessage(`${payload.name} left the game`),
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
              `${payload.old_name} changed their name to ${payload.new_name}`
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
        case "error": {
          const payload = msg.payload as ErrorPayload;
          setErrorToast(payload.message);
          setTimeout(() => setErrorToast(null), 4000);
          break;
        }
      }
    });

    return unsubscribe;
  }, [subscribe, code, navigate]);

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

  // Visual Viewport API for mobile keyboard
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      const container = chatContainerRef.current;
      if (container) {
        container.style.height = `${viewport.height}px`;
      }
    };

    viewport.addEventListener("resize", handleResize);
    viewport.addEventListener("scroll", handleResize);
    handleResize();

    return () => {
      viewport.removeEventListener("resize", handleResize);
      viewport.removeEventListener("scroll", handleResize);
    };
  }, []);

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

  // Cleanup typing timeout and participant typing timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      participantsTypingRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Send message
  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    const result = chatMessageSchema.safeParse(trimmed);
    if (!result.success) return;

    send({ type: "user_message", payload: { text: trimmed } });
    setInputText("");
    sendTypingStop();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [inputText, send, sendTypingStop]);

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
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  };

  // Scroll to bottom on pill click
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setHasNewMessages(false);
  };

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
      setNameError(result.error.issues[0]?.message ?? "Invalid name");
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
        setNameError("Failed to change name. Please try again.");
      }
    } finally {
      setSavingName(false);
    }
  }, [code, nameInput, savingName, participant, setParticipant]);

  if (!participant || !event || !code) return null;

  const isValidMessage = chatMessageSchema.safeParse(inputText.trim()).success;

  // Determine if we should show a fatal error for close codes
  const fatalMessage =
    closeCode !== null && FATAL_CLOSE_CODES.has(closeCode)
      ? FATAL_CLOSE_MESSAGES[closeCode] ?? "Connection closed."
      : null;

  return (
    <div ref={chatContainerRef} className="flex h-svh flex-col bg-white">
      {/* Header with menu */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold text-gray-900">City Roam</h1>
        <Menu as="div" className="relative">
          <MenuButton className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Options menu">
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
                Change Name
              </button>
            </MenuItem>
            <MenuItem>
              <button
                onClick={() => setShowLeaveDialog(true)}
                className="flex w-full items-center px-4 py-2.5 text-sm text-red-600 data-[focus]:bg-gray-50"
              >
                Leave Game
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>

      {/* Connection status banners */}
      {wsStatus === "reconnecting" && (
        <div className="shrink-0 bg-yellow-400 px-4 py-1.5 text-center text-sm font-medium text-yellow-900">
          Reconnecting...
        </div>
      )}
      {showConnectedBanner && wsStatus === "connected" && (
        <div className="shrink-0 bg-green-500 px-4 py-1.5 text-center text-sm font-medium text-white">
          Connected
        </div>
      )}
      {maxAttemptsReached && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-red-500 px-4 py-2 text-center text-sm font-medium text-white">
          <span>Unable to reconnect</span>
          <button
            onClick={manualRetry}
            className="rounded-md bg-white/20 px-3 py-0.5 text-sm font-semibold hover:bg-white/30"
          >
            Retry
          </button>
        </div>
      )}
      {fatalMessage && (
        <div className="shrink-0 bg-red-500 px-4 py-1.5 text-center text-sm font-medium text-white">
          {fatalMessage}
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
                <span>Guide</span>
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
              ? `${[...participantsTyping.keys()][0]} is typing...`
              : "Multiple people are typing..."}
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
            New messages &darr;
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
            placeholder="Type a message..."
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            style={{ maxHeight: `${MAX_INPUT_HEIGHT}px` }}
          />
          <button
            onClick={handleSend}
            disabled={!isValidMessage}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            aria-label="Send message"
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
              Leave Game?
            </DialogTitle>
            <p className="mt-2 text-sm text-gray-600">
              You'll be removed from the game. You can rejoin later by opening the link again.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowLeaveDialog(false)}
                disabled={leaving}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLeave}
                disabled={leaving}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {leaving ? "Leaving..." : "Leave"}
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
              Change Name
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
                maxLength={30}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Enter your name"
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
                Cancel
              </button>
              <button
                onClick={handleChangeName}
                disabled={savingName}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savingName ? "Saving..." : "Save"}
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
              aria-label="Close"
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
  message: ChatMessagePayload;
  prevMessage: ChatMessagePayload | null;
  isSelf: boolean;
  isFirstInGuideSequence: boolean;
  onImageClick: (url: string) => void;
}

function MessageRow({
  message,
  prevMessage,
  isSelf,
  isFirstInGuideSequence,
  onImageClick,
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
        <SelfBubble message={message} onImageClick={onImageClick} />
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
}: {
  message: ChatMessagePayload;
  onImageClick: (url: string) => void;
}) {
  return (
    <div className="mb-chat-gap flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-bubble-self px-3 py-2 text-white">
        <p className="whitespace-pre-wrap break-words"><Linkify text={message.content} /></p>
        <MessageImage url={message.image_url} onClick={onImageClick} />
      </div>
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
  return (
    <div className="mb-chat-gap flex justify-start">
      <div className="max-w-[75%]">
        {showLabel && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-system-text">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <span>Guide</span>
          </div>
        )}
        <div className="rounded-2xl rounded-bl-sm bg-bubble-guide px-3 py-2 text-gray-900">
          <p className="whitespace-pre-wrap break-words"><Linkify text={message.content} /></p>
          <MessageImage url={message.image_url} onClick={onImageClick} />
        </div>
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
