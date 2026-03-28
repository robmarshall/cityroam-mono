import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminDashboardResponse } from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { STATUS_LABELS, STATUS_COLORS, STATUS_ORDER, formatDate } from "../lib/event-utils";

export default function DashboardPage() {
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useAuthFetch();
  const navigate = useNavigate();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() =>
        api.get<AdminDashboardResponse>("/admin/dashboard"),
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError("Failed to load dashboard data.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-600">{error || "Failed to load data."}</p>
        <button
          onClick={fetchDashboard}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalEvents = STATUS_ORDER.reduce(
    (sum, s) => sum + (data.counts[s] || 0),
    0,
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {STATUS_ORDER.map((status) => {
          const colors = STATUS_COLORS[status];
          return (
            <div
              key={status}
              className={`rounded-lg ${colors.bg} p-4`}
            >
              <p className={`text-sm font-medium ${colors.text}`}>
                {STATUS_LABELS[status]}
              </p>
              <p className={`mt-1 text-2xl font-bold ${colors.text}`}>
                {data.counts[status] || 0}
              </p>
            </div>
          );
        })}

        {/* Revenue card */}
        <div className="rounded-lg bg-purple-100 p-4">
          <p className="text-sm font-medium text-purple-700">Revenue Events</p>
          <p className="mt-1 text-2xl font-bold text-purple-700">
            {data.total_revenue_events}
          </p>
        </div>
      </div>

      {/* Summary */}
      <p className="mb-6 text-sm text-gray-500">
        {totalEvents} total event{totalEvents !== 1 ? "s" : ""}
      </p>

      {/* Recent events */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Recent Events
        </h2>

        {data.recent_events.length === 0 ? (
          <p className="text-sm text-gray-500">No events yet.</p>
        ) : (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.recent_events.map((event: AdminDashboardResponse["recent_events"][number]) => {
                  const colors = STATUS_COLORS[event.status];
                  return (
                    <tr
                      key={event.code}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
