// Five-field cron expressions in local time, and the form's presets. No UI here.
// The expression is the only stored schedule; "" is manual only.

const FIELDS = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of the month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] },
  { name: "day of the week", min: 0, max: 7, names: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] },
];
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = DAYS.map((d) => d.slice(0, 3));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseField(text, field) {
  const bad = () => new Error(`Invalid ${field.name}: ${text}`);
  const number = (s) => {
    const named = field.names?.indexOf(s.toLowerCase()) ?? -1;
    const value = named >= 0 ? named + field.min : /^\d+$/.test(s) ? Number(s) : NaN;
    if (!(value >= field.min && value <= field.max)) throw bad();
    return value;
  };
  const values = new Set();
  for (const item of text.split(",")) {
    const match = /^(\*|[a-z0-9]+)(?:-([a-z0-9]+))?(?:\/(\d+))?$/i.exec(item);
    if (!match || (match[1] === "*" && match[2])) throw bad();
    const step = match[3] === undefined ? 1 : Number(match[3]);
    if (!step) throw bad();
    const from = match[1] === "*" ? field.min : number(match[1]);
    const to = match[2] ? number(match[2]) : match[1] === "*" || match[3] ? field.max : from;
    if (to < from) throw bad();
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return values;
}

// Throws an Error with a message for the person.
export function parse(expression) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error("Use five fields: minute, hour, day, month, weekday.");
  const [minutes, hours, days, months, weekdays] = parts.map((p, i) => parseField(p, FIELDS[i]));
  if (weekdays.has(7)) weekdays.add(0);
  return { minutes, hours, days, months, weekdays, anyDay: parts[2].startsWith("*"), anyWeekday: parts[4].startsWith("*") };
}

// As cron does: when both day fields are restricted, one match is sufficient.
function dayMatches(c, date) {
  if (!c.months.has(date.getMonth() + 1)) return false;
  const day = c.days.has(date.getDate()), weekday = c.weekdays.has(date.getDay());
  return c.anyDay || c.anyWeekday ? day && weekday : day || weekday;
}

export function matches(c, date) {
  return c.minutes.has(date.getMinutes()) && c.hours.has(date.getHours()) && dayMatches(c, date);
}

// The next `count` times after `from`, as Dates; empty when there is none.
export function upcoming(c, from, count = 1) {
  const out = [];
  const sorted = (set) => [...set].sort((a, b) => a - b);
  const hours = sorted(c.hours), minutes = sorted(c.minutes);
  // Eight years and a day: 29 February can be that far away.
  for (let i = 0; i <= 2923 && out.length < count; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (!dayMatches(c, day)) continue;
    for (const h of hours) for (const m of minutes) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      // A time that the clock change removes does not exist on that day.
      if (out.length < count && at > from && at.getHours() === h && at.getMinutes() === m) out.push(at);
    }
  }
  return out;
}

// ---- presets ------------------------------------------------------------------

export const PRESETS = [
  ["manual", "Manual only"], ["every", "Every few minutes"], ["hourly", "Every hour"], ["daily", "Every day"],
  ["weekdays", "Monday to Friday"], ["weekly", "Every week"], ["custom", "Custom (cron)"],
];
export const INTERVALS = [5, 10, 15, 20, 30];
const pad = (n) => String(n).padStart(2, "0");

// { preset, every, minute, time, weekday, cron } for the form.
export function toForm(cron) {
  const form = { preset: "custom", every: 15, minute: "0", time: "09:00", weekday: 1, cron };
  if (!cron) return { ...form, preset: "manual" };
  const every = /^\*\/(\d+) \* \* \* \*$/.exec(cron);
  if (every && INTERVALS.includes(Number(every[1]))) return { ...form, preset: "every", every: Number(every[1]) };
  const fixed = /^(\d{1,2}) (\*|\d{1,2}) \* \* (\*|1-5|[0-6])$/.exec(cron);
  if (!fixed) return form;
  const [, m, h, d] = fixed;
  if (h === "*") return d === "*" ? { ...form, preset: "hourly", minute: m } : form;
  const time = `${pad(h)}:${pad(m)}`;
  if (d === "*") return { ...form, preset: "daily", time };
  return d === "1-5" ? { ...form, preset: "weekdays", time } : { ...form, preset: "weekly", time, weekday: Number(d) };
}

// The expression of the form's choices. Throws an Error with a message for the person.
export function fromForm({ preset, every, minute, time, weekday, cron }) {
  if (preset === "manual") return "";
  if (preset === "every") return `*/${every} * * * *`;
  if (preset === "custom") {
    const clean = cron.trim().replace(/\s+/g, " ");
    if (!upcoming(parse(clean), new Date()).length) throw new Error("This date never occurs.");
    return clean;
  }
  if (preset === "hourly") {
    if (!/^\d{1,2}$/.test(minute.trim()) || Number(minute) > 59) throw new Error("The minute must be from 0 to 59.");
    return `${Number(minute)} * * * *`;
  }
  const at = /^(\d{1,2})[:h](\d{2})$/.exec(time.trim());
  if (!at || Number(at[1]) > 23 || Number(at[2]) > 59) throw new Error("Write the time as HH:MM, for example 09:30.");
  return `${Number(at[2])} ${Number(at[1])} * * ${{ daily: "*", weekdays: "1-5", weekly: weekday }[preset]}`;
}

export function describe(cron) {
  const f = toForm(cron);
  return {
    manual: "Manual only",
    every: `Every ${f.every} minutes`,
    hourly: `Every hour at :${pad(f.minute)}`,
    daily: `Every day at ${f.time}`,
    weekdays: `Monday to Friday at ${f.time}`,
    weekly: `Every ${DAYS[f.weekday]} at ${f.time}`,
    custom: `Cron ${cron}`,
  }[f.preset];
}

// "Today 09:00", "Tomorrow 09:00", "Yesterday 09:00", "Fri 09:00" (this week) or "3 Dec 09:00".
export function when(date, from = new Date()) {
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(from)) / 86_400_000);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = { "-1": "Yesterday", 0: "Today", 1: "Tomorrow" }[days]
    ?? (days > 1 && days < 7 ? SHORT[date.getDay()] : `${date.getDate()} ${MONTHS[date.getMonth()]}${date.getFullYear() === from.getFullYear() ? "" : ` ${date.getFullYear()}`}`);
  return `${day} ${clock}`;
}
