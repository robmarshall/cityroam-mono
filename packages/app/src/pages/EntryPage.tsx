import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { eventCodeSchema } from "@cityroam/shared/validation/player";

/**
 * Normalise a typed or pasted event code the same way the API does:
 * codes are lowercase, and we drop the separators people commonly paste
 * (spaces, hyphens, underscores) so "K7FQ-2MTZ" becomes "k7fq2mtz".
 * A pasted event link is reduced to its code so the whole URL works too.
 * Anything else is left in place so validation can flag it.
 */
export function normaliseEventCode(raw: string): string {
  const fromLink = raw.match(/\/event\/([^/?#\s]+)/i);
  const value = fromLink ? fromLink[1] : raw;
  return value.replace(/[\s\-_]/g, "").toLowerCase();
}

export default function EntryPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const normalised = normaliseEventCode(code);
      if (normalised.length === 0) {
        setFieldError(t("entry.emptyCode"));
        return;
      }

      const result = eventCodeSchema.safeParse(normalised);
      if (!result.success) {
        setFieldError(t("entry.invalidCode"));
        return;
      }

      setFieldError(null);
      navigate(`/event/${result.data}`);
    },
    [code, navigate, t],
  );

  return (
    <div className="flex min-h-svh items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
          {t("entry.title")}
        </h1>
        <p className="mb-8 text-center text-sm text-gray-600">
          {t("entry.subtitle")}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="event-code"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {t("entry.codeLabel")}
          </label>
          <input
            id="event-code"
            name="event-code"
            type="text"
            autoComplete="off"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="go"
            value={code}
            onChange={(e) => {
              setCode(normaliseEventCode(e.target.value));
              if (fieldError) setFieldError(null);
            }}
            placeholder={t("entry.codePlaceholder")}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "event-code-error" : undefined}
            className={`mb-1 block w-full rounded-lg border px-3 py-3.5 text-center text-lg tracking-[0.3em] text-gray-900 placeholder-gray-400 placeholder:tracking-normal focus:outline-none focus:ring-2 ${
              fieldError
                ? "border-red-300 focus:ring-red-500"
                : "border-gray-300 focus:ring-brand-500"
            }`}
          />
          {fieldError ? (
            <p id="event-code-error" className="mb-3 text-sm text-red-600">
              {fieldError}
            </p>
          ) : (
            <div className="mb-3" />
          )}

          <button
            type="submit"
            disabled={code.trim().length === 0}
            className="w-full rounded-lg bg-brand-600 px-4 py-3.5 font-medium text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("entry.submitButton")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-system-text">
          {t("entry.help")}
        </p>

      </div>
    </div>
  );
}
