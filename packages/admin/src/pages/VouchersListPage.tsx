import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { AdminVoucherListResponse, VoucherStatus } from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { formatDate } from "../lib/event-utils";
import {
  VOUCHER_STATUS_COLORS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUS_ORDER,
} from "../lib/voucher-utils";

const PER_PAGE = 20;
const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500";

export default function VouchersListPage() {
  const [data, setData] = useState<AdminVoucherListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "ALL">("ALL");
  // The search box is only applied when Search is pressed.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const authFetch = useAuthFetch();
  const navigate = useNavigate();

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() =>
        api.vouchers.list({
          q: search || undefined,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          page,
          per_page: PER_PAGE,
        }),
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message || "Failed to load vouchers.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch, page, search, statusFilter]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gift Vouchers</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <form onSubmit={handleSearch} className="flex items-end gap-2">
          <div>
            <label htmlFor="voucher-search" className="mb-1 block text-sm font-medium text-gray-700">
              Code or buyer email
            </label>
            <input
              id="voucher-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ABCD-EFGH-JK or name@example.com"
              className="w-72 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </form>

        <div>
          <label htmlFor="voucher-status" className="mb-1 block text-sm font-medium text-gray-700">
            Status
          </label>
          <select
            id="voucher-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as VoucherStatus | "ALL");
              setPage(1);
            }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All</option>
            {VOUCHER_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {VOUCHER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-500">Loading vouchers...</div>
      ) : error || !data ? (
        <div className="py-20 text-center">
          <p className="mb-4 text-red-600">{error || "Failed to load data."}</p>
          <button
            onClick={fetchVouchers}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : data.vouchers.length === 0 ? (
        <p className="text-sm text-gray-500">No vouchers found.</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className={TH}>Code</th>
                  <th className={TH}>Buyer Email</th>
                  <th className={TH}>For</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Bought</th>
                  <th className={TH}>Expires</th>
                  <th className={TH}>Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.vouchers.map((v) => {
                  const colors = VOUCHER_STATUS_COLORS[v.status];
                  return (
                    <tr
                      key={v.id}
                      onClick={() => navigate(`/vouchers/${v.id}`)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-medium text-gray-900">
                        {v.code}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {v.purchaser_email ?? <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {v.recipient_name ?? <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
                        >
                          {VOUCHER_STATUS_LABELS[v.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(v.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(v.expires_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {v.email_failed_at ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Failed
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {data.total} voucher{data.total === 1 ? "" : "s"}
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
