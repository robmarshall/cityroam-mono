import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminEventListResponse, AdminRouteListResponse, AdminCreateEventResponse } from "@cityroam/shared/types";
import type { EventStatus } from "@cityroam/shared/types";
import { adminCreateEventSchema } from "@cityroam/shared/validation";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_ORDER,
  formatDate,
} from "../lib/event-utils";

const INPUT_CLS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const BTN_PRIMARY =
  "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700";

export default function EventsListPage() {
  const [data, setData] = useState<AdminEventListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [statusFilter, setStatusFilter] = useState<EventStatus | "ALL">("ALL");
  const authFetch = useAuthFetch();
  const navigate = useNavigate();

  // Create event modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [routes, setRoutes] = useState<AdminRouteListResponse["routes"]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [createForm, setCreateForm] = useState({ route_id: "", buyer_email: "", expires_in_days: "" });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      });
      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      const res = await authFetch(() =>
        api.get<AdminEventListResponse>(`/admin/events?${params.toString()}`),
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError("Failed to load events.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch, page, perPage, statusFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Reset to page 1 when filter changes
  const handleStatusChange = (value: EventStatus | "ALL") => {
    setStatusFilter(value);
    setPage(1);
  };

  const openCreateModal = async () => {
    setShowCreateModal(true);
    setCreateForm({ route_id: "", buyer_email: "", expires_in_days: "" });
    setCreateErrors({});
    setCreatedCode(null);
    setCopied(false);

    if (routes.length === 0) {
      setLoadingRoutes(true);
      try {
        const res = await authFetch(() =>
          api.get<AdminRouteListResponse>("/admin/routes"),
        );
        setRoutes(res.routes);
      } catch {
        setCreateErrors({ _form: "Failed to load routes." });
      } finally {
        setLoadingRoutes(false);
      }
    }
  };

  const handleCreate = async () => {
    setCreateErrors({});

    const payload: Record<string, unknown> = { route_id: createForm.route_id };
    if (createForm.buyer_email.trim()) {
      payload.buyer_email = createForm.buyer_email.trim();
    }
    if (createForm.expires_in_days.trim()) {
      payload.expires_in_days = parseInt(createForm.expires_in_days, 10);
    }

    const result = adminCreateEventSchema.safeParse(payload);
    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "_form");
        errors[key] = issue.message;
      }
      setCreateErrors(errors);
      return;
    }

    setCreating(true);
    try {
      const res = await authFetch(() =>
        api.post<AdminCreateEventResponse>("/admin/events", result.data),
      );
      setCreatedCode(res.event.code);
      fetchEvents();
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateErrors({ _form: err.message });
      }
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async () => {
    if (createdCode) {
      await navigator.clipboard.writeText(createdCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading events...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-600">{error || "Failed to load data."}</p>
        <button
          onClick={fetchEvents}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalPages = Math.ceil(data.total / perPage);
  const rangeStart = (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, data.total);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <button onClick={openCreateModal} className={BTN_PRIMARY}>
          Create Free Event
        </button>
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            {createdCode ? (
              // Success state — show the code
              <div className="text-center">
                <h2 className="mb-2 text-lg font-semibold text-gray-900">Event Created</h2>
                <p className="mb-4 text-sm text-gray-600">Share this code with the player:</p>
                <div className="mb-4 flex items-center justify-center gap-2">
                  <span className="rounded-md bg-gray-100 px-4 py-3 font-mono text-2xl font-bold tracking-wider text-gray-900">
                    {createdCode}
                  </span>
                  <button
                    onClick={copyCode}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            ) : (
              // Form state
              <>
                <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Free Event</h2>

                {createErrors._form && (
                  <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{createErrors._form}</p>
                )}

                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Route</label>
                  {loadingRoutes ? (
                    <p className="text-sm text-gray-500">Loading routes...</p>
                  ) : (
                    <select
                      value={createForm.route_id}
                      onChange={(e) => {
                        setCreateForm((f) => ({ ...f, route_id: e.target.value }));
                        setCreateErrors((e) => { const n = { ...e }; delete n.route_id; return n; });
                      }}
                      className={INPUT_CLS}
                    >
                      <option value="">Select a route</option>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.city})
                        </option>
                      ))}
                    </select>
                  )}
                  {createErrors.route_id && (
                    <p className="mt-1 text-sm text-red-600">{createErrors.route_id}</p>
                  )}
                </div>

                <div className="mb-4">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Buyer Email <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={createForm.buyer_email}
                    onChange={(e) => {
                      setCreateForm((f) => ({ ...f, buyer_email: e.target.value }));
                      setCreateErrors((e) => { const n = { ...e }; delete n.buyer_email; return n; });
                    }}
                    placeholder="email@example.com"
                    className={INPUT_CLS}
                  />
                  {createErrors.buyer_email && (
                    <p className="mt-1 text-sm text-red-600">{createErrors.buyer_email}</p>
                  )}
                </div>

                <div className="mb-6">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Expires in <span className="text-gray-400">(days, default 90)</span>
                  </label>
                  <input
                    type="number"
                    value={createForm.expires_in_days}
                    onChange={(e) => {
                      setCreateForm((f) => ({ ...f, expires_in_days: e.target.value }));
                      setCreateErrors((e) => { const n = { ...e }; delete n.expires_in_days; return n; });
                    }}
                    placeholder="90"
                    min="1"
                    max="365"
                    className={INPUT_CLS}
                  />
                  {createErrors.expires_in_days && (
                    <p className="mt-1 text-sm text-red-600">{createErrors.expires_in_days}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className={`${BTN_PRIMARY} disabled:opacity-50`}
                  >
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Status filter */}
      <div className="mb-4">
        <label
          htmlFor="status-filter"
          className="mr-2 text-sm font-medium text-gray-700"
        >
          Status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) =>
            handleStatusChange(e.target.value as EventStatus | "ALL")
          }
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="ALL">All</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {data.events.length === 0 ? (
        <p className="text-sm text-gray-500">No events found.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Buyer Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Participants
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.events.map((event: AdminEventListResponse["events"][number]) => {
                  const colors = STATUS_COLORS[event.status];
                  return (
                    <tr
                      key={event.id}
                      onClick={() => navigate(`/events/${event.id}`)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-mono font-medium text-gray-900">
                        {event.code}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {event.buyer_email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                        >
                          {STATUS_LABELS[event.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(event.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {event.participant_count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {rangeStart}-{rangeEnd} of {data.total} events
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
