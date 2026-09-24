import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { AdminVoucherDetail } from "@cityroam/shared/types";
import { api, ApiError } from "../lib/api";
import { useAuthFetch } from "../contexts/AuthContext";
import { formatDate } from "../lib/event-utils";
import {
  VOUCHER_STATUS_COLORS,
  VOUCHER_STATUS_LABELS as LABELS,
  canResend,
  canVoid,
  formatMoney,
} from "../lib/voucher-utils";

type Modal = "void" | "resend" | null;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="col-span-2 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

const DASH = <span className="text-gray-400">&mdash;</span>;

export default function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const authFetch = useAuthFetch();
  const [voucher, setVoucher] = useState<AdminVoucherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [modal, setModal] = useState<Modal>(null);
  const [voidReason, setVoidReason] = useState("");
  const [working, setWorking] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(() => api.vouchers.get(id));
      setVoucher(res.voucher);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.status === 404 ? "Voucher not found." : err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [authFetch, id]);

  useEffect(() => {
    load();
  }, [load]);

  const closeModal = () => {
    setModal(null);
    setModalError(null);
    setVoidReason("");
  };

  const handleVoid = async () => {
    if (!voucher) return;
    setWorking(true);
    setModalError(null);
    try {
      const res = await authFetch(() => api.vouchers.void(voucher.id, voidReason.trim() || undefined));
      setVoucher(res.voucher);
      setNotice("Voucher voided. It can no longer be redeemed. No refund was issued.");
      closeModal();
    } catch (err) {
      if (err instanceof ApiError) setModalError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const handleResend = async () => {
    if (!voucher) return;
    setWorking(true);
    setModalError(null);
    try {
      const res = await authFetch(() => api.vouchers.resendEmail(voucher.id));
      setNotice(`Voucher email sent to ${voucher.purchaser_email} (${res.attempts} attempt${res.attempts === 1 ? "" : "s"}).`);
      closeModal();
      load();
    } catch (err) {
      if (err instanceof ApiError) setModalError(err.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-gray-500">Loading voucher...</div>;
  }

  if (error || !voucher) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-600">{error || "Failed to load voucher."}</p>
        <Link to="/vouchers" className="text-sm text-blue-600 hover:underline">
          Back to vouchers
        </Link>
      </div>
    );
  }

  const colors = VOUCHER_STATUS_COLORS[voucher.status];

  return (
    <div className="max-w-3xl">
      <Link to="/vouchers" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
        &larr; Vouchers
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-gray-900">{voucher.code}</h1>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}>
          {LABELS[voucher.status]}
        </span>
      </div>

      {notice && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          {notice}
          <button onClick={() => setNotice(null)} className="ml-2 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {voucher.email_failed_at && voucher.status === "PURCHASED" && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          The voucher email failed at {formatDate(voucher.email_failed_at)}
          {voucher.email_error ? `: ${voucher.email_error}` : ""}. Use Resend Email once the cause is fixed.
        </div>
      )}

      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setModal("resend")}
          disabled={!canResend(voucher.status, voucher.purchaser_email)}
          title={canResend(voucher.status, voucher.purchaser_email) ? undefined : "Only an unredeemed voucher with a buyer email can be resent"}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Resend Email
        </button>
        <button
          onClick={() => setModal("void")}
          disabled={!canVoid(voucher.status)}
          title={canVoid(voucher.status) ? undefined : "Only an unredeemed voucher can be voided"}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Void Voucher
        </button>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <dl className="divide-y divide-gray-100">
          <Row label="Buyer email">{voucher.purchaser_email ?? DASH}</Row>
          <Row label="For">{voucher.recipient_name ?? DASH}</Row>
          <Row label="Message">
            {voucher.message ? <span className="whitespace-pre-wrap">{voucher.message}</span> : DASH}
          </Row>
          <Row label="Language">{voucher.language.toUpperCase()}</Row>
          <Row label="Hunt">{voucher.route_family ? voucher.route_family.name : "Any hunt"}</Row>
          <Row label="Paid">{formatMoney(voucher.amount_total, voucher.currency)}</Row>
          <Row label="Bought">{formatDate(voucher.created_at)}</Row>
          <Row label="Expires">{formatDate(voucher.expires_at)}</Row>
          <Row label="Redeemed">
            {voucher.redeemed_at ? formatDate(voucher.redeemed_at) : DASH}
            {voucher.redeemed_event && (
              <>
                {" "}
                &middot;{" "}
                <Link to={`/events/${voucher.redeemed_event.id}`} className="font-mono text-blue-600 hover:underline">
                  {voucher.redeemed_event.code}
                </Link>{" "}
                <span className="text-gray-500">({voucher.redeemed_event.status})</span>
              </>
            )}
          </Row>
          {voucher.refunded_at && <Row label="Refunded">{formatDate(voucher.refunded_at)}</Row>}
          {voucher.voided_at && (
            <Row label="Voided">
              {formatDate(voucher.voided_at)}
              {voucher.void_reason && <span className="block whitespace-pre-wrap text-gray-600">{voucher.void_reason}</span>}
            </Row>
          )}
          <Row label="Voucher email">
            {voucher.email_sent_at ? `Sent ${formatDate(voucher.email_sent_at)}` : voucher.email_failed_at ? "Failed" : DASH}
          </Row>
          <Row label="Redemption link">
            <a href={voucher.redeem_url} target="_blank" rel="noreferrer" className="break-all text-blue-600 hover:underline">
              {voucher.redeem_url}
            </a>
          </Row>
          <Row label="Stripe session">{voucher.stripe_session_id ? <code className="text-xs">{voucher.stripe_session_id}</code> : DASH}</Row>
          <Row label="Stripe payment">{voucher.stripe_payment_id ? <code className="text-xs">{voucher.stripe_payment_id}</code> : DASH}</Row>
        </dl>
      </div>

      <p className="text-xs text-gray-500">
        Refunds are issued from the Stripe dashboard. A full refund marks an unredeemed voucher Refunded; for a
        redeemed voucher it refunds the event it created instead.
      </p>

      {modal === "void" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Void Voucher</h3>
            <p className="mb-4 text-sm text-gray-600">
              Void <span className="font-mono font-medium">{voucher.code}</span>? It will stop working immediately.
              This does not refund the buyer and cannot be undone.
            </p>
            <label htmlFor="void-reason" className="mb-1 block text-sm font-medium text-gray-700">
              Reason <span className="text-gray-400">(optional, kept for 12 months)</span>
            </label>
            <textarea
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              maxLength={500}
              rows={3}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {modalError && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{modalError}</div>}
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={working}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleVoid}
                disabled={working}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {working ? "Voiding..." : "Void Voucher"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "resend" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Resend Voucher Email</h3>
            <p className="mb-4 text-sm text-gray-600">
              Send the voucher email for <span className="font-mono font-medium">{voucher.code}</span> to{" "}
              <span className="font-medium">{voucher.purchaser_email}</span> again?
            </p>
            {modalError && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{modalError}</div>}
            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                disabled={working}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResend}
                disabled={working}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {working ? "Sending..." : "Send Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
