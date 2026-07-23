import { AuthButton } from "@/components/auth-button";
import { ExchangeAction } from "@/components/exchange-action";
import { createBarcodeSvg } from "@/lib/barcode";
import { auth } from "@/lib/auth";
import {
  isDevelopmentAuthBypassEnabled,
  isExchangeCounterpart,
  isExchangeExpired,
} from "@/lib/exchange";
import { getExchangeByToken } from "@/lib/exchange-service";
import type { Metadata } from "next";
import { headers } from "next/headers";

type ExchangePageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Meal invitation · Princeton Meal Exchange",
  description: "Review and accept your meal exchange invitation.",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

export default async function ExchangePage({ params }: ExchangePageProps) {
  const { token } = await params;
  const record = await getExchangeByToken(token);

  if (!record) {
    return (
      <ExchangeShell>
        <div className="state-card state-card-centered">
          <span className="state-icon state-icon-muted" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M9.5 9a3 3 0 1 1 4.2 2.75c-1 .5-1.7 1.1-1.7 2.25"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M12 18h.01"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <p className="eyebrow">Invitation unavailable</p>
          <h1>This exchange link isn’t valid.</h1>
          <p className="muted measure">
            Check that the complete link was copied from the invitation email,
            or ask the host to send it again.
          </p>
        </div>
      </ExchangeShell>
    );
  }

  const authBypassed = isDevelopmentAuthBypassEnabled();
  const session = authBypassed
    ? null
    : await auth.api.getSession({ headers: await headers() });
  if (!authBypassed && !session) {
    return (
      <ExchangeShell>
        <div className="state-card state-card-centered">
          <span className="state-icon state-icon-orange" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect
                x="5"
                y="10"
                width="14"
                height="10"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M8 10V7a4 4 0 0 1 8 0v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p className="eyebrow">Private invitation</p>
          <h1>Sign in to review this exchange.</h1>
          <p className="muted measure">
            Use the Princeton account at {maskEmail(record.counterpartEmail)} so
            we can match you to the invitation.
          </p>
          <AuthButton
            callbackURL={`/exchanges/${token}`}
            className="button button-primary sign-in-button"
            signInLabel="Sign in with Princeton NetID"
          />
        </div>
      </ExchangeShell>
    );
  }

  if (
    !authBypassed &&
    !isExchangeCounterpart(
      record.counterpartUserId,
      record.counterpartEmail,
      record.status,
      session?.user,
    )
  ) {
    return (
      <ExchangeShell>
        <div className="state-card state-card-centered">
          <span className="state-icon state-icon-error" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M12 7.5v5M12 16.5h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <p className="eyebrow">Different account</p>
          <h1>This invitation isn’t for {session?.user.email}.</h1>
          <p className="muted measure">
            {record.status === "accepted"
              ? "This exchange is linked to the account that accepted it. Sign in with that same account."
              : `Sign out, then use the Princeton account at ${maskEmail(record.counterpartEmail)}.`}
          </p>
          <AuthButton className="button button-secondary sign-in-button" />
        </div>
      </ExchangeShell>
    );
  }

  const accepted = record.status === "accepted";
  const expired = isExchangeExpired(record.expiresAt);
  const emailFailed = record.confirmationEmailStatus === "failed";
  const barcodeSvg =
    accepted && !expired ? createBarcodeSvg(record.barcodeValue) : null;

  return (
    <ExchangeShell>
      {authBypassed ? (
        <div className="dev-preview" role="status">
          Development preview · authentication bypassed as{" "}
          {record.counterpartEmail}
        </div>
      ) : null}
      <div className="exchange-heading">
        <p className="eyebrow">
          {expired
            ? "Expired invitation"
            : accepted
              ? "Door pass"
              : "Meal invitation"}
        </p>
        <h1>
          {expired
            ? "This exchange has expired."
            : accepted
              ? "Your exchange is confirmed."
              : `${record.hostName} invited you to a meal.`}
        </h1>
        <p className="exchange-lead">
          {expired
            ? "The door code is no longer active. Ask the host to create a new exchange."
            : accepted
              ? `You’re all set, ${record.counterpartName}. Keep this pass ready for the door.`
              : `${record.counterpartName}, review the details below and accept when you’re ready.`}
        </p>
      </div>

      <section className="exchange-card" aria-labelledby="details-heading">
        <div className="card-header">
          <div>
            <p className="card-kicker">Exchange details</p>
            <h2 id="details-heading">
              {capitalize(record.mealType)} at {record.location}
            </h2>
          </div>
          <span
            className={`status-tag ${expired ? "status-bad" : accepted ? "status-ok" : "status-warn"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {expired ? (
                <>
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M12 7.5v5M12 16.5h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </>
              ) : accepted ? (
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <>
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M12 7.5V12l3 2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
            </svg>
            {expired ? "Expired" : accepted ? "Accepted" : "Awaiting response"}
          </span>
        </div>

        <dl className="detail-list">
          <div>
            <dt>Host</dt>
            <dd>{record.hostName}</dd>
          </div>
          <div>
            <dt>Guest</dt>
            <dd>{record.counterpartName}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>{record.location}</dd>
          </div>
          <div>
            <dt>Meal</dt>
            <dd>{capitalize(record.mealType)}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{dateFormatter.format(record.expiresAt)}</dd>
          </div>
        </dl>

        {accepted && barcodeSvg ? (
          <div className="door-pass">
            <div
              className="barcode"
              role="img"
              aria-label={`Door barcode ${record.barcodeValue}`}
              dangerouslySetInnerHTML={{ __html: barcodeSvg }}
            />
            <p className="barcode-label">Door code</p>
            <p className="barcode-value">{record.barcodeValue}</p>
            <p className="pass-note">
              Show this barcode at the door. If it cannot be scanned, read the
              printed code above.
            </p>
          </div>
        ) : null}

        {expired ? (
          <div className="notice notice-error" role="status">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M12 7.5v5M12 16.5h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <strong>Door pass expired</strong>
              <span>
                This exchange can no longer be accepted or used at the door.
              </span>
            </div>
          </div>
        ) : emailFailed ? (
          <div className="notice notice-error" role="status">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M12 7.5v5M12 16.5h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <div>
              <strong>Your exchange is accepted.</strong>
              <span>
                We couldn’t send the confirmation email, but your door pass is
                ready. You can retry below.
              </span>
            </div>
          </div>
        ) : accepted ? (
          <div className="notice notice-ok" role="status">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M8 12.3l2.6 2.6L16 9.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <strong>Confirmation sent</strong>
              <span>
                A copy of this pass was emailed to {record.counterpartEmail}.
              </span>
            </div>
          </div>
        ) : (
          <p className="accept-note">
            Accepting confirms this meal exchange and creates your shared door
            pass.
          </p>
        )}

        {!expired ? (
          <ExchangeAction
            token={token}
            accepted={accepted}
            confirmationEmailFailed={emailFailed}
          />
        ) : null}
      </section>
    </ExchangeShell>
  );
}

function ExchangeShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="exchange-page">
      <a className="skip-link" href="#exchange-content">
        Skip to exchange
      </a>
      <header className="product-header">
        <span className="brand" aria-label="Meal Exchange">
          <span className="brand-tile" aria-hidden="true">
            <span className="brand-eye brand-eye-left" />
            <span className="brand-eye brand-eye-right" />
            <span className="brand-mouth" />
          </span>
          <span className="brand-name">
            <b>Meal Exchange</b>
            <span>Princeton Dining</span>
          </span>
        </span>
        <span className="secure-label">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect
              x="5"
              y="10"
              width="14"
              height="10"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M8 10V7a4 4 0 0 1 8 0v3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Private invitation
        </span>
      </header>
      <div className="exchange-stage" id="exchange-content">
        <div className="exchange-container">{children}</div>
      </div>
      <footer className="product-footer">
        Built by <strong>Hoagie Club</strong> for Princeton students.
      </footer>
    </main>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "the invited email address";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`;
}
