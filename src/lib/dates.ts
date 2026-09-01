/**
 * Calendar helpers. A "day" is a YYYY-MM-DD label in the user's own timezone,
 * computed once server-side when a log is written, so streaks and daily totals
 * match the day the user actually lived.
 */

export function localDay(date: Date, timezone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(date);
  }
}

/** Day labels are calendar arithmetic, so do it in UTC to dodge DST entirely. */
export function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** "09:12" in the user's own timezone. */
export function localTime(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(date);
  }
}

/** Monday-start week containing `day`. */
export function startOfWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7; // Mon = 0
  return addDays(day, -weekday);
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** "Good morning" / "Good afternoon" / "Good evening" for the user's timezone. */
export function greetingFor(date: Date, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false })
      .format(date),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
