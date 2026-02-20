export function toHHMMSS(secs: number): string {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor(secs / 60) % 60;
  const seconds = secs % 60;
  return [hours, minutes, seconds]
    .map((v) => v < 10 ? "0" + v : v)
    .join(":");
}

export type categoriesArray = { game: string; startTimestamp: Date; title: string }[];

// Helper function to check if a date is valid
export function isValidDate(date: Date | undefined): date is Date {
  return !!date && date instanceof Date && !isNaN(date.getTime());
}
