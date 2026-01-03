function getStrLength(str: string): number {
  return [...str].length;
}

function strSlice(str: string, to: number): string {
  return [...str].filter((_x, i) => i < to).map(
    (x) => x,
  ).join("");
}

function truncateString(
  str: string,
  maxLength: number, // Now represents max length for this specific string
) {
  const currentLength = getStrLength(str);
  if (currentLength > maxLength) {
    // Keep 1 characters for "…"
    return strSlice(str, Math.max(0, maxLength - 1)) + "…";
  }
  return str;
}

export function makeTitle(
  date: string,
  data: { title: string; user_name: string },
  partNumber?: number, // Add optional partNumber
  totalMaxLength: number = 100, // Define total max length
) {
  const datePrefix = `[${date}] `;
  const suffix = ` [${data.user_name.toUpperCase()} TWITCH VOD]`;
  let partString = "";
  let partLength = 0;

  if (partNumber && partNumber > 1) {
    partString = `PART ${partNumber} - `;
    partLength = getStrLength(partString);
  }

  const fixedLength = getStrLength(datePrefix) + getStrLength(suffix) + partLength;
  const availableTitleLength = Math.max(0, totalMaxLength - fixedLength);

  const truncatedTitle = truncateString(data.title, availableTitleLength);

  return `${datePrefix}${partString}${truncatedTitle}${suffix}`;
}
