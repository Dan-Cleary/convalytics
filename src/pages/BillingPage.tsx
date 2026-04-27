import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { Button } from "../components/Button";
import { formatEventLimit, formatRetention } from "../lib/timeRange";
import { PLANS as PLAN_DEFS, type PlanId } from "../../convex/plans";

const PLAN_ORDER: PlanId[] = ["free", "solo", "pro"];

const PLANS = PLAN_ORDER.map((id) => ({
  id,
  name: PLAN_DEFS[id].displayName,
  price: PLAN_DEFS[id].priceMonthly,
  events: `${formatEventLimit(PLAN_DEFS[id].eventsPerMonth)} events/mo`,
  retention: `${formatRetention(PLAN_DEFS[id].retentionDays)} retention`,
  mcp: id === "free" ? "No MCP" : "MCP included",
}));

export function BillingPage() {
  const usage = useQuery(api.usage.getMyUsage, {});
  const createCheckout = useAction(api.billing.createCheckoutSession);
  const createPortal = useAction(api.billing.createPortalSession);
  const [loading, setLoading] = useState<PlanId | "portal" | null>(null);

  async function handleUpgrade(plan: PlanId) {
    if (plan === "free") return;
    setLoading(plan);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckout({
        plan,
        successUrl: `${origin}/?billing=success&plan=${plan}`,
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
        returnUrl: window.location.origin,
      });
      if (url) window.location.href = url;
    } finally {
      setLoading(null);
    }
  }

  if (usage === undefined) {
    return <div className="p-8 text-sm text-gray-400">Loading...</div>;
  }

  if (usage === null) {
    return (
      <div className="p-8 text-sm text-gray-400">
        Unable to load billing info.
      </div>
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
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: "#1a1814" }}
          >
            Events this month
          </span>
          <span className="text-xs" style={{ color: "#6b6456" }}>
            {formatEventLimit(usage.usage)} / {formatEventLimit(usage.limit)}
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
            {formatRetention(usage.retentionDays)} data retention
          </span>
        </div>
        <p className="text-[10px] mt-3" style={{ color: "#9b9488" }}>
          Page views are free and don't count toward this limit.
        </p>
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
                  <span
                    className="text-[10px]"
                    style={{ color: isCurrent ? "#9b9488" : "#6b6456" }}
                  >
                    {plan.events}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: isCurrent ? "#9b9488" : "#6b6456" }}
                  >
                    {plan.retention}
                  </span>
                  <span
                    className="text-[10px]"
                    style={{
                      color:
                        plan.id === "free"
                          ? (isCurrent ? "#6b6456" : "#9b9488")
                          : "#e8651c",
                      fontWeight: plan.id === "free" ? 400 : 600,
                    }}
                  >
                    {plan.mcp}
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

                {!isCurrent &&
                  !isDowngrade &&
                  plan.id !== "free" &&
                  (usage.plan === "free" ||
                    (usage.plan === "solo" &&
                      plan.id === "pro" &&
                      usage.hasStripeSubscription)) && (
                    <Button
                      size="sm"
                      disabled={
                        loading === (usage.plan === "free" ? plan.id : "portal")
                      }
                      onClick={() =>
                        void (usage.plan === "free"
                          ? handleUpgrade(plan.id)
                          : handleManage())
                      }
                    >
                      {loading === (usage.plan === "free" ? plan.id : "portal")
                        ? "Opening…"
                        : "Upgrade"}
                    </Button>
                  )}

                {!isCurrent && isDowngrade && usage.hasStripeSubscription && (
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
        Payments handled securely by Stripe. Cancel anytime from the billing
        portal.
      </p>
    </div>
  );
}
