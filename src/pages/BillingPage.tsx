import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    events: "50K events/mo",
    retention: "30-day retention",
  },
  {
    id: "solo" as const,
    name: "Solo",
    price: "$29/mo",
    events: "500K events/mo",
    retention: "90-day retention",
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$99/mo",
    events: "5M events/mo",
    retention: "1-year retention",
  },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function BillingPage({ sessionToken }: { sessionToken: string }) {
  const usage = useQuery(api.usage.getMyUsage, { sessionToken });
  const createCheckout = useAction(api.billing.createCheckoutSession);
  const createPortal = useAction(api.billing.createPortalSession);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(plan: "solo" | "pro") {
    setLoading(plan);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckout({
        sessionToken,
        plan,
        successUrl: `${origin}/?billing=success`,
        cancelUrl: `${origin}/`,
      });
      if (url) window.location.href = url;
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setLoading("portal");
    try {
      const { url } = await createPortal({
        sessionToken,
        returnUrl: window.location.origin,
      });
      if (url) window.location.href = url;
    } finally {
      setLoading(null);
    }
  }

  if (usage === undefined) {
    return (
      <div className="p-8 text-sm text-gray-400">Loading...</div>
    );
  }

  if (usage === null) {
    return (
      <div className="p-8 text-sm text-gray-400">Unable to load billing info.</div>
    );
  }

  const pct = Math.min(100, Math.round((usage.usage / usage.limit) * 100));
  const barColor = pct >= 100 ? "#c0392b" : pct >= 80 ? "#e8651c" : "#2d7a2d";

  return (
    <div className="p-8 max-w-2xl">
      <h1
        className="text-xs font-bold uppercase tracking-widest mb-6"
        style={{ color: "#1a1814" }}
      >
        Billing & Plan
      </h1>

      {/* Current usage */}
      <div
        className="p-5 mb-6"
        style={{ border: "2px solid #1a1814", background: "#fff" }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#1a1814" }}>
            This month
          </span>
          <span className="text-xs" style={{ color: "#6b6456" }}>
            {fmt(usage.usage)} / {fmt(usage.limit)} events
          </span>
        </div>
        {/* Usage bar */}
        <div className="h-2 w-full" style={{ background: "#e9e6db" }}>
          <div
            className="h-2 transition-all"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px]" style={{ color: "#9b9488" }}>
            {pct}% used
          </span>
          <span className="text-[10px]" style={{ color: "#9b9488" }}>
            {usage.retentionDays}-day data retention
          </span>
        </div>
      </div>

      {/* Plan cards */}
      <div className="flex flex-col gap-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === usage.plan;
          const isDowngrade =
            (usage.plan === "pro" && plan.id !== "pro") ||
            (usage.plan === "solo" && plan.id === "free");

          return (
            <div
              key={plan.id}
              className="flex items-center justify-between px-5 py-4"
              style={{
                border: isCurrent ? "2px solid #1a1814" : "2px solid #d5d0c8",
                background: isCurrent ? "#1a1814" : "#fff",
                boxShadow: isCurrent ? "4px 4px 0 #e8651c" : "none",
              }}
            >
              <div className="flex items-center gap-4">
                <div>
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: isCurrent ? "#e9e6db" : "#1a1814" }}
                  >
                    {plan.name}
                  </span>
                  {isCurrent && (
                    <span
                      className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5"
                      style={{ background: "#e8651c", color: "#fff" }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <span className="text-[10px]" style={{ color: isCurrent ? "#9b9488" : "#6b6456" }}>
                    {plan.events}
                  </span>
                  <span className="text-[10px]" style={{ color: isCurrent ? "#9b9488" : "#6b6456" }}>
                    {plan.retention}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-bold"
                  style={{ color: isCurrent ? "#e9e6db" : "#1a1814" }}
                >
                  {plan.price}
                </span>

                {isCurrent && usage.hasStripeSubscription && (
                  <button
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
                    style={{
                      background: "transparent",
                      color: "#9b9488",
                      border: "1px solid #3e3a32",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#e9e6db";
                      e.currentTarget.style.borderColor = "#e9e6db";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "#9b9488";
                      e.currentTarget.style.borderColor = "#3e3a32";
                    }}
                    disabled={loading === "portal"}
                    onClick={() => void handleManage()}
                  >
                    {loading === "portal" ? "Opening…" : "Manage"}
                  </button>
                )}

                {!isCurrent && !isDowngrade && plan.id !== "free" && (
                  <button
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
                    style={{
                      background: "#e8651c",
                      color: "#fff",
                      border: "2px solid #e8651c",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#c9581a";
                      e.currentTarget.style.borderColor = "#c9581a";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#e8651c";
                      e.currentTarget.style.borderColor = "#e8651c";
                    }}
                    disabled={loading === plan.id}
                    onClick={() => void handleUpgrade(plan.id)}
                  >
                    {loading === plan.id ? "Opening…" : "Upgrade"}
                  </button>
                )}

                {!isCurrent && isDowngrade && (
                  <button
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    style={{ color: "#9b9488", border: "1px solid #d5d0c8" }}
                    disabled={loading === "portal"}
                    onClick={() => void handleManage()}
                  >
                    {loading === "portal" ? "Opening…" : "Downgrade"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px]" style={{ color: "#9b9488" }}>
        Payments handled securely by Stripe. Cancel anytime from the billing portal.
      </p>
    </div>
  );
}
