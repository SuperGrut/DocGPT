export const INTERVALS = ["month", "year"] as const;
export type Interval = (typeof INTERVALS)[number];

export const PAID_PLAN_KEYS = ["pro"] as const;
export type PaidPlanKey = (typeof PAID_PLAN_KEYS)[number];
export type PlanKey = "free" | PaidPlanKey;
export type Currency = "USD" | "INR";

export const NO_LIMIT = Number.MAX_SAFE_INTEGER;
const MB = 1024 * 1024;

export interface PlanLimits {
  maxDocuments: number;
  maxFileBytes: number;
  maxPagesPerDocument: number;
  messagesPerMonth: number;
}

export interface PlanDef {
  key: PlanKey | "unlimited";
  name: string;
  /** Higher wins when a user has more than one entitled subscription. */
  rank: number;
  limits: PlanLimits;
  /** Display prices only. What is actually charged is defined at each provider: keep them in sync. */
  prices?: Record<Interval, Record<Currency, number>>;
}

// Placeholder numbers: set your own.
export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: "free",
    name: "Free",
    rank: 0,
    limits: {
      maxDocuments: 5,
      maxFileBytes: 10 * MB,
      maxPagesPerDocument: 100,
      messagesPerMonth: 50,
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    rank: 10,
    limits: {
      maxDocuments: 100,
      maxFileBytes: 50 * MB,
      maxPagesPerDocument: 500,
      messagesPerMonth: 2_000,
    },
    prices: {
      month: { USD: 19, INR: 1_499 },
      year: { USD: 190, INR: 14_999 },
    },
  },
};

/** Used when billing is disabled (self-hosted): nothing is limited. */
export const UNLIMITED_PLAN: PlanDef = {
  key: "unlimited",
  name: "Self-hosted",
  rank: 100,
  limits: {
    maxDocuments: NO_LIMIT,
    maxFileBytes: NO_LIMIT,
    maxPagesPerDocument: NO_LIMIT,
    messagesPerMonth: NO_LIMIT,
  },
};

export const isPlanKey = (v: string): v is PlanKey =>
  Object.prototype.hasOwnProperty.call(PLANS, v);
export const isPaidPlanKey = (v: string): v is PaidPlanKey =>
  (PAID_PLAN_KEYS as readonly string[]).includes(v);

/** JSON can't carry "no limit" as a number, so unlimited becomes null. */
export function publicLimits(l: PlanLimits) {
  const n = (v: number) => (v >= NO_LIMIT ? null : v);
  return {
    maxDocuments: n(l.maxDocuments),
    maxFileBytes: n(l.maxFileBytes),
    maxPagesPerDocument: n(l.maxPagesPerDocument),
    messagesPerMonth: n(l.messagesPerMonth),
  };
}
