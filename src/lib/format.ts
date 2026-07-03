const DATE = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatDate(d: Date): string {
  return DATE.format(d);
}

export function formatDateTime(d: Date): string {
  return `${DATE_TIME.format(d)} UTC`;
}

export function formatMoney(n: number): string {
  return MONEY.format(n);
}

export function formatDecimal(n: number, digits = 2): string {
  return n.toFixed(digits);
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}
