export const terminalStatuses = new Set([
  "done",
  "delivered",
  "cancelled",
  "canceled",
  "completed",
  "finished",
]);

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

