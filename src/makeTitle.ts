function getStrLength(str: string): number {
  return [...new Intl.Segmenter().segment(str)].length;
}

function strSlice(str: string, to: number): string {
  return [...new Intl.Segmenter().segment(str)].filter((_x, i) => i < to).map(
    (x) => x.segment,
  ).join("");
}

function truncateString(
  str: string,
  channelNameLength: number,
  maxLength: number = 100,
) {
  if (getStrLength(str) + (27 + channelNameLength) >= maxLength) {
    return strSlice(str, maxLength - (27 + channelNameLength) - 3) + "...";
  }
  return str;
}

export function makeTitle(
  date: string,
  data: { title: string; user_name: string },
) {
  return `[${date}] ${truncateString(data.title, data.user_name.length)} [${data.user_name.toUpperCase()} TWITCH VOD]`;
}
