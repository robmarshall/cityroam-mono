import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  AdminEventDetailResponse,
  SenderType,
  Participant,
} from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatTime } from "../lib/event-utils";

const SENDER_COLORS: Record<SenderType, string> = {
  user: "bg-blue-50 border-blue-200",
  guide: "bg-gray-50 border-gray-200",
  system: "bg-amber-50 border-amber-200",
};

const SENDER_BADGE_COLORS: Record<SenderType, string> = {
  user: "bg-blue-100 text-blue-700",
  guide: "bg-gray-200 text-gray-700",
  system: "bg-amber-100 text-amber-700",
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminEventDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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

  const handleCopyPaymentId = async (paymentId: string) => {
    await navigator.clipboard.writeText(paymentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          </div>
        </div>
      )}

      {/* Event Info Grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard label="Route" value={data.route_name ?? "Unknown"} />
        <InfoCard label="Buyer Email" value={event.buyer_email} />
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

      {/* Participants */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Participants ({participants.length})
        </h2>

        {participants.length === 0 ? (
          <p className="text-sm text-gray-500">No participants yet.</p>
        ) : (
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
                    Left
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Left Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {participants.map((p: Participant) => (
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
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {formatDate(p.joined_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {p.left_at ? formatDate(p.left_at) : "--"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {p.left_reason ?? "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Message Log */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Messages ({messages.length})
        </h2>

        {messages.length === 0 ? (
          <p className="text-sm text-gray-500">No messages yet.</p>
        ) : (
          <div className="max-h-[600px] overflow-y-auto rounded-lg border border-gray-200 p-4 space-y-3">
            {[...messages]
              .sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              )
              .map((msg) => (
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
                    <span className="ml-auto text-xs text-gray-500">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-800">
                    {msg.content}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
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
