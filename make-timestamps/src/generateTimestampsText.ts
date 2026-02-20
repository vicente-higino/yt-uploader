import { type categoriesArray, isValidDate, toHHMMSS } from "./misc.ts";
import { difference } from "@std/datetime";

// Helper function to generate the timestamps text

export function generateTimestampsText(categoriesArray: categoriesArray): string | null {
  if (categoriesArray.length === 0) return null;

  const originalFirstTimestamp = categoriesArray[0]?.startTimestamp; // Store the very first timestamp
  if (!isValidDate(originalFirstTimestamp)) {
    console.error(`Invalid reference timestamp in first category: ${JSON.stringify(categoriesArray[0])}`);
    return null;
  }

  // --- Merging Logic ---
  const CLOSE_THRESHOLD_MILLISECONDS = 60 * 1000;
  const mergedCategories: categoriesArray = [];

  if (categoriesArray.length > 0) {
    // Start with the first category, making a deep copy
    mergedCategories.push({ ...categoriesArray[0] });

    for (let i = 1; i < categoriesArray.length; i++) {
      const currentCategory = categoriesArray[i];
      const lastMergedCategory = mergedCategories[mergedCategories.length - 1];

      // Ensure both dates are valid before calculating difference
      if (!isValidDate(currentCategory.startTimestamp) || !isValidDate(lastMergedCategory.startTimestamp)) {
        console.error(
          `Invalid startTimestamp found during merge check. Current: ${JSON.stringify(currentCategory)}, Last Merged: ${
            JSON.stringify(lastMergedCategory)
          }`,
        );
        // Add the current category as is if it's valid, otherwise skip
        if (isValidDate(currentCategory.startTimestamp)) {
          mergedCategories.push({ ...currentCategory });
        }
        continue;
      }

      const timeDiffMs = currentCategory.startTimestamp.getTime() - lastMergedCategory.startTimestamp.getTime();

      // Merge if close in time AND game or title is the same as the previous entry
      if (
        timeDiffMs <= CLOSE_THRESHOLD_MILLISECONDS &&
        (currentCategory.game === lastMergedCategory.game || currentCategory.title === lastMergedCategory.title)
      ) {
        // Merge: Update the last merged entry's timestamp to the earlier one
        console.log(
          `Merging close entries: Updating timestamp from ${lastMergedCategory.startTimestamp.toISOString()} to ${currentCategory.startTimestamp.toISOString()}, game/title from ${lastMergedCategory.game}/${lastMergedCategory.title} to ${currentCategory.game}/${currentCategory.title}`,
        );
        lastMergedCategory.startTimestamp = new Date(
          Math.min(lastMergedCategory.startTimestamp.getTime(), currentCategory.startTimestamp.getTime()),
        ); // Retain the earlier timestamp during merge
        lastMergedCategory.game = currentCategory.game;
        lastMergedCategory.title = currentCategory.title;
      } else {
        // Not close enough, add the current category as a new entry (deep copy)
        mergedCategories.push({ ...currentCategory });
      }
    }
  }
  // --- End Merging Logic ---
  // --- Generate Text from Merged Categories ---
  let text = "";
  // Use originalFirstTimestamp as the reference for calculating HH:MM:SS offsets
  const referenceTimestamp = originalFirstTimestamp;

  for (const category of mergedCategories) {
    if (!isValidDate(category.startTimestamp)) {
      console.error(`Invalid startTimestamp found in merged category: ${JSON.stringify(category)}`);
      text += `Error: Invalid start time - ${category.game} - ${category.title}\n`;
      continue;
    }

    // Calculate difference relative to the ORIGINAL reference timestamp
    const timeDiff = difference(referenceTimestamp, category.startTimestamp);
    const seconds = Math.max(0, Math.floor((timeDiff.milliseconds ?? 0) / 1000));
    const timestamp = `${toHHMMSS(seconds)} ${category.game} - ${category.title}\n`;
    text += timestamp;
    console.log(`Timestamp generated (merged): ${timestamp.trim()}`);
  }
  // --- End Generate Text ---
  return text;
}
