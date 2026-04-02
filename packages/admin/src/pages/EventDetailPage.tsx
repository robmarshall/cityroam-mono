import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  AdminEventDetailResponse,
  Message,
  SenderType,
} from "@cityroam/shared/types";

type EventParticipant = AdminEventDetailResponse["participants"][number];
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatTime } from "../lib/event-utils";

const SENDER_COLORS: Record<SenderType, string> = {
  user: "bg-blue-50 border-blue-200",
  guide: "bg-gray-50 border-gray-200",
  system: "bg-amber-50 border-amber-200",
  dropped: "bg-red-50 border-red-200",
};

const SENDER_BADGE_COLORS: Record<SenderType, string> = {
  user: "bg-blue-100 text-blue-700",
  guide: "bg-gray-200 text-gray-700",
  system: "bg-amber-100 text-amber-700",
  dropped: "bg-red-100 text-red-700",
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminEventDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState(false);
  const [refundNote, setRefundNote] = useState("");
  const [refundRequested, setRefundRequested] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isEditingRefund, setIsEditingRefund] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const authFetch = useAuthFetch();

  const fetchEvent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() =>
        api.get<AdminEventDetailResponse>(`/admin/events/${id}`),
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError("Failed to load event data.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch, id]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // Sync refund fields when data loads
  useEffect(() => {
    if (data) {
      setRefundNote(data.event.refund_note ?? "");
      setRefundRequested(data.event.refund_requested);
    }
  }, [data]);

  // Silent auto-refresh every 5 seconds so new messages appear without manual reload
  // Pauses when user is editing the refund section to avoid overwriting their changes
  useEffect(() => {
    if (isEditingRefund) return;

    const interval = setInterval(async () => {
      try {
        const res = await authFetch(() =>
          api.get<AdminEventDetailResponse>(`/admin/events/${id}`),
        );
        setData(res);
        setRefreshError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setRefreshError("Session expired — please log in again.");
        }
        // Other errors are silently ignored — initial load handles error display
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [authFetch, id, isEditingRefund]);

  const handleCopyPaymentId = async (paymentId: string) => {
    await navigator.clipboard.writeText(paymentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveRefundNote = async () => {
    setSavingNote(true);
    setNoteError(null);
    setNoteSaved(false);
    try {
      await authFetch(() =>
        api.patch(`/admin/events/${id}`, {
          refund_requested: refundRequested,
          refund_note: refundNote,
        }),
      );
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 3000);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setNoteError(err.message);
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleRefund = async () => {
    setRefunding(true);
    setRefundError(null);
    try {
      await authFetch(() =>
        api.post(`/admin/events/${id}/refund`),
      );
      setRefundSuccess(true);
      setShowRefundModal(false);
      fetchEvent();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setRefundError(err.message);
      }
    } finally {
      setRefunding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading event...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-600">{error || "Failed to load data."}</p>
        <button
          onClick={fetchEvent}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const { event, participants, messages } = data;
  const statusColors = STATUS_COLORS[event.status];

  return (
    <div>
      {/* Back link */}
      <Link
        to="/events"
        className="mb-4 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
      >
        &larr; Back to Events
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Event <span className="font-mono">{event.code}</span>
        </h1>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors.bg} ${statusColors.text}`}
        >
          {STATUS_LABELS[event.status]}
        </span>
      </div>

      {/* Session expired warning */}
      {refreshError && (
        <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          {refreshError}
        </div>
      )}

      {/* Refund feedback */}
      {refundSuccess && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Refund issued successfully.
          <button
            onClick={() => setRefundSuccess(false)}
            className="ml-2 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {refundError && !showRefundModal && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {refundError}
          <button
            onClick={() => setRefundError(null)}
            className="ml-2 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stripe Payment ID */}
      {data.stripe_payment_id && (
        <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-purple-600">
            Stripe Payment ID
          </p>
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono font-medium text-purple-900">
              {data.stripe_payment_id}
            </code>
            <button
              onClick={() => handleCopyPaymentId(data.stripe_payment_id!)}
              className="rounded bg-purple-200 px-2 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-300"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {event.status !== "REFUNDED" && (
              <button
                onClick={() => {
                  setRefundError(null);
                  setShowRefundModal(true);
                }}
                className="ml-auto rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Issue Refund
              </button>
            )}
          </div>
        </div>
      )}

      {/* Refund confirmation modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              Confirm Refund
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to refund this event? This action cannot be
              undone.
            </p>
            {refundError && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {refundError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRefundModal(false);
                  setRefundError(null);
                }}
                disabled={refunding}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={refunding}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {refunding ? "Refunding..." : "Confirm Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Note */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Refund
        </h2>
        <label className="mb-3 flex items-center gap-2">
          <input
            type="checkbox"
            checked={refundRequested}
            onChange={(e) => setRefundRequested(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-700">Refund Requested</span>
        </label>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Refund Note
        </label>
        <textarea
          value={refundNote}
          onChange={(e) => setRefundNote(e.target.value)}
          onFocus={() => setIsEditingRefund(true)}
          onBlur={() => setIsEditingRefund(false)}
          placeholder="Add notes about the refund..."
          rows={3}
          maxLength={2000}
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveRefundNote}
            disabled={savingNote}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingNote ? "Saving..." : "Save"}
          </button>
          {noteSaved && (
            <span className="text-sm text-green-600">Saved successfully</span>
          )}
          {noteError && (
            <span className="text-sm text-red-600">{noteError}</span>
          )}
        </div>
      </div>

      {/* Game Progress */}
      {data.total_stops != null && data.total_stops > 0 && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Game Progress
          </h2>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-lg font-bold text-gray-900">
              Stop {event.current_stop} of {data.total_stops}
            </span>
            <span className="text-sm text-gray-500">
              {data.total_stops > 0
                ? Math.round((event.current_stop / data.total_stops) * 100)
                : 0}
              %
            </span>
          </div>
          {/* Progress bar */}
          <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-3 rounded-full bg-blue-600 transition-all"
              style={{
                width: `${data.total_stops > 0 ? (event.current_stop / data.total_stops) * 100 : 0}%`,
              }}
            />
          </div>
          {/* Step indicators */}
          <div className="mb-4 flex justify-between">
            {Array.from({ length: data.total_stops }, (_, i) => {
              const stopNum = i + 1;
              const isCompleted = stopNum <= event.current_stop;
              const isCurrent = stopNum === event.current_stop;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                      isCompleted
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    } ${isCurrent ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
                  >
                    {stopNum}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-3">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">
                {event.hints_given}
              </p>
              <p className="text-xs text-gray-500">Hints Given</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">
                {event.wrong_attempts}
              </p>
              <p className="text-xs text-gray-500">Wrong Attempts</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900">
                {event.guide_response_count}
              </p>
              <p className="text-xs text-gray-500">Guide Responses</p>
            </div>
          </div>
        </div>
      )}

      {/* Event Info Grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard label="Route" value={data.route_name ?? "Unknown"} />
        <InfoCard label="Buyer Email" value={event.buyer_email} />
        {(data.total_stops == null || data.total_stops === 0) && (
          <>
            <InfoCard label="Current Stop" value={String(event.current_stop)} />
            <InfoCard label="Hints Given" value={String(event.hints_given)} />
            <InfoCard
              label="Wrong Attempts"
              value={String(event.wrong_attempts)}
            />
            <InfoCard
              label="Guide Responses"
              value={String(event.guide_response_count)}
            />
          </>
        )}
        <InfoCard label="Created" value={formatDate(event.created_at)} />
        <InfoCard
          label="Started"
          value={event.started_at ? formatDate(event.started_at) : "--"}
        />
        <InfoCard
          label="Completed"
          value={event.completed_at ? formatDate(event.completed_at) : "--"}
        />
        <InfoCard label="Expires" value={formatDate(event.expires_at)} />
      </div>

      {/* EventParticipants */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          EventParticipants ({participants.length})
        </h2>

        {participants.length === 0 ? (
          <p className="text-sm text-gray-500">No participants yet.</p>
        ) : (
          <>
            {/* EventParticipant Summary */}
            <EventParticipantSummary participants={participants} />

            {/* EventParticipants Table */}
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Last Seen
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {participants.map((p: EventParticipant) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                        {p.display_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {p.is_lead && (
                          <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                            Lead
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <EventParticipantStatusBadge participant={p} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(p.joined_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {p.left_at
                          ? formatDate(p.left_at)
                          : formatDate(p.last_seen_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Message Log */}
      <MessageLog messages={messages} participants={participants} />
    </div>
  );
}

function EventParticipantSummary({ participants }: { participants: EventParticipant[] }) {
  const total = participants.length;
  const active = participants.filter((p) => p.is_active).length;
  const left = participants.filter((p) => p.left_at != null).length;
  const inactive = total - active - left;
  const lead = participants.find((p) => p.is_lead);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-lg bg-gray-50 p-3 text-center">
        <p className="text-2xl font-bold text-gray-900">{total}</p>
        <p className="text-xs text-gray-500">Total</p>
      </div>
      <div className="rounded-lg bg-green-50 p-3 text-center">
        <p className="text-2xl font-bold text-green-700">{active}</p>
        <p className="text-xs text-green-600">Online</p>
      </div>
      <div className="rounded-lg bg-yellow-50 p-3 text-center">
        <p className="text-2xl font-bold text-yellow-700">{inactive}</p>
        <p className="text-xs text-yellow-600">Offline</p>
      </div>
      <div className="rounded-lg bg-red-50 p-3 text-center">
        <p className="text-2xl font-bold text-red-700">{left}</p>
        <p className="text-xs text-red-600">Left</p>
      </div>
      {lead && (
        <div className="col-span-2 flex items-center gap-2 rounded-lg bg-purple-50 p-3 lg:col-span-4">
          <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            Lead
          </span>
          <span className="text-sm font-medium text-purple-900">
            {lead.display_name}
          </span>
        </div>
      )}
    </div>
  );
}

function EventParticipantStatusBadge({ participant: p }: { participant: EventParticipant }) {
  if (p.left_at != null) {
    const reason =
      p.left_reason === "voluntary"
        ? "Left voluntarily"
        : p.left_reason === "timeout"
          ? "Timed out"
          : "Left";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
        {reason}
      </span>
    );
  }

  if (p.is_active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
        Online
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500" />
      Offline
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

const SENDER_TYPE_OPTIONS: { value: SenderType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "user", label: "User" },
  { value: "guide", label: "Guide" },
  { value: "dropped", label: "Dropped" },
  { value: "system", label: "System" },
];

function MessageLog({
  messages,
  participants,
}: {
  messages: Message[];
  participants: EventParticipant[];
}) {
  const [senderTypeFilter, setSenderTypeFilter] = useState<SenderType | "all">("all");
  const [participantFilter, setEventParticipantFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Unique participant names from messages (only user messages have meaningful names)
  const participantNames = useMemo(() => {
    const names = new Set<string>();
    for (const msg of messages) {
      if (msg.sender_type === "user" && msg.sender_name) {
        names.add(msg.sender_name);
      }
    }
    return Array.from(names).sort();
  }, [messages]);

  const sortedAndFiltered = useMemo(() => {
    const sorted = [...messages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return sorted.filter((msg) => {
      if (senderTypeFilter !== "all" && msg.sender_type !== senderTypeFilter) {
        return false;
      }
      if (participantFilter !== "all" && msg.sender_name !== participantFilter) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          msg.content.toLowerCase().includes(q) ||
          msg.sender_name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [messages, senderTypeFilter, participantFilter, searchQuery]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsAtBottom(atBottom);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  };

  const hasActiveFilters =
    senderTypeFilter !== "all" || participantFilter !== "all" || searchQuery !== "";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Messages{" "}
          <span className="text-base font-normal text-gray-500">
            ({sortedAndFiltered.length}
            {hasActiveFilters ? ` of ${messages.length}` : ""})
          </span>
        </h2>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-gray-500">No messages yet.</p>
      ) : (
        <>
          {/* Filters */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {/* Sender type filter */}
            <div className="flex rounded-lg border border-gray-200 bg-white">
              {SENDER_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSenderTypeFilter(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    senderTypeFilter === opt.value
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* EventParticipant name filter */}
            {participantNames.length > 0 && (
              <select
                value={participantFilter}
                onChange={(e) => setEventParticipantFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700"
              >
                <option value="all">All participants</option>
                {participantNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}

            {/* Search */}
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 w-48"
            />

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSenderTypeFilter("all");
                  setEventParticipantFilter("all");
                  setSearchQuery("");
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Message list */}
          <div className="relative">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="max-h-[600px] overflow-y-auto rounded-lg border border-gray-200 p-4 space-y-3"
            >
              {sortedAndFiltered.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No messages match the current filters.
                </p>
              ) : (
                sortedAndFiltered.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg border p-3 ${SENDER_COLORS[msg.sender_type]}`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {msg.sender_name}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SENDER_BADGE_COLORS[msg.sender_type]}`}
                      >
                        {msg.sender_type}
                      </span>
                      {msg.image_url && (
                        <span className="text-xs text-gray-400">
                          (has image)
                        </span>
                      )}
                      <span className="ml-auto text-xs text-gray-500">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-800">
                      {msg.content}
                    </p>
                    {msg.image_url && (
                      <img
                        src={msg.image_url}
                        alt="Message attachment"
                        className="mt-2 max-h-48 rounded-md"
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Scroll to bottom button */}
            {!isAtBottom && sortedAndFiltered.length > 0 && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-4 right-6 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-md hover:bg-blue-700"
              >
                Scroll to latest
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
