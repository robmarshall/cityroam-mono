import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminRouteFamilyListResponse } from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";

export default function RouteFamiliesPage() {
  const [data, setData] = useState<AdminRouteFamilyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const authFetch = useAuthFetch();

  const fetchFamilies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() =>
        api.get<AdminRouteFamilyListResponse>(`/admin/route-families`),
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError("Failed to load route families.");
      } else if (!(err instanceof ApiError)) {
        setError("Failed to load route families.");
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchFamilies();
  }, [fetchFamilies]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading route families...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-600">{error || "Failed to load data."}</p>
        <button
          onClick={fetchFamilies}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Routes</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Route Family
        </button>
      </div>

      {data.route_families.length === 0 ? (
        <p className="text-sm text-gray-500">No route families found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.route_families.map((family) => (
            <Link
              key={family.id}
              to={`/routes/families/${family.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                {family.name}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{family.city}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {family.routes.map((route) => (
                  <span
                    key={route.id}
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      route.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {route.language.toUpperCase()}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateFamilyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchFamilies();
          }}
        />
      )}
    </div>
  );
}

function CreateFamilyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useAuthFetch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await authFetch(() =>
        api.post(`/admin/route-families`, { name, city }),
      );
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message || "Failed to create route family.");
      } else if (!(err instanceof ApiError)) {
        setError("Failed to create route family.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Create Route Family
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {error && (
            <p className="mb-4 text-sm text-red-600">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
