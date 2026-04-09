import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const PLAN_LABELS: Record<string, string> = {
  solo: "Solo",
  pro: "Pro",
  free: "Free",
};

const PLAN_TAGLINES: Record<string, string> = {
  free: "50K events/mo · 90-day retention",
  solo: "500K events/mo · 1-year retention",
  pro: "5M events/mo · Unlimited retention",
};

export function BillingSuccessModal({
  sessionToken,
  expectedPlan,
  onClose,
}: {
  sessionToken: string;
  expectedPlan: "free" | "solo" | "pro" | null;
  onClose: () => void;
}) {
  const usage = useQuery(api.usage.getMyUsage, { sessionToken });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const duration = 3000;
    const end = Date.now() + duration;
    const colors = ["#e8651c", "#1a1814", "#c9581a", "#f0a070", "#fff"];
    let frameId: number | undefined;

    // Initial big burst
    void confetti({
      particleCount: 80,
      spread: 100,
      origin: { y: 0.55 },
      colors,
    });

    // Side streams
    const frame = () => {
      void confetti({
        particleCount: 4,
        angle: 60,
        spread: 65,
        origin: { x: 0, y: 0.6 },
        colors,
        gravity: 0.9,
      });
      void confetti({
        particleCount: 4,
        angle: 120,
        spread: 65,
        origin: { x: 1, y: 0.6 },
        colors,
        gravity: 0.9,
      });

      if (Date.now() < end) {
        frameId = requestAnimationFrame(frame);
      }
    };
    frame();

    return () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, []);

  const plan =
    usage?.plan && (usage.plan !== "free" || expectedPlan === null)
      ? usage.plan
      : expectedPlan;
  const planName = plan ? (PLAN_LABELS[plan] ?? plan) : "…";
  const tagline = plan ? (PLAN_TAGLINES[plan] ?? "") : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(26,24,20,0.55)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center gap-5 p-8 w-full max-w-xs mx-4"
        style={{
          background: "#fff",
          border: "3px solid #1a1814",
          boxShadow: "10px 10px 0 #e8651c",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Orange badge */}
        <div
          className="w-14 h-14 flex items-center justify-center text-2xl select-none"
          style={{ background: "#e8651c", flexShrink: 0 }}
        >
          🎉
        </div>

        <div className="text-center">
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-1"
            style={{ color: "#e8651c" }}
          >
            Plan activated
          </p>
          <h2
            className="text-xl font-bold uppercase tracking-tight mb-2"
            style={{ color: "#1a1814" }}
          >
            Welcome to {planName}!
          </h2>
          {tagline && (
            <p
              className="text-[11px] leading-relaxed"
              style={{ color: "#6b6456" }}
            >
              {tagline}
            </p>
          )}
          <p
            className="text-[11px] leading-relaxed mt-2"
            style={{ color: "#9b9488" }}
          >
            Your quota is live. New events will count against your updated limit
            right away.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-all"
          style={{
            background: "#1a1814",
            color: "#fff",
            border: "2px solid #1a1814",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e8651c";
            e.currentTarget.style.borderColor = "#e8651c";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#1a1814";
            e.currentTarget.style.borderColor = "#1a1814";
          }}
        >
          Let's go →
        </button>
      </div>
    </div>
  );
}
