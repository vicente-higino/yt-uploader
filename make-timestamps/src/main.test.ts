import { assertEquals } from "jsr:@std/assert";
import { generateTimestampsText } from "./generateTimestampsText.ts";

Deno.test("generateTimestampsText - empty categories array", () => {
    const categoriesArray: { game: string; startTimestamp: Date; title: string }[] = [];
    const result = generateTimestampsText(categoriesArray);
    assertEquals(result, null, "Should return null for an empty categories array");
});

Deno.test("generateTimestampsText - invalid first timestamp", () => {
    const categoriesArray = [
        { game: "Game A", startTimestamp: new Date("invalid"), title: "Title A" },
    ];
    const result = generateTimestampsText(categoriesArray);
    assertEquals(result, null, "Should return null for invalid first timestamp");
});

Deno.test("generateTimestampsText - single valid category", () => {
    const categoriesArray = [
        { game: "Game A", startTimestamp: new Date("2023-01-01T00:00:00Z"), title: "Title A" },
    ];
    const result = generateTimestampsText(categoriesArray);
    const expected = "00:00:00 Game A - Title A\n";
    assertEquals(result, expected, "Should return correct timestamp for a single category");
});

Deno.test("generateTimestampsText - multiple categories with valid timestamps", () => {
    const categoriesArray = [
        { game: "Game A", startTimestamp: new Date("2023-01-01T00:00:00Z"), title: "Title A" },
        { game: "Game B", startTimestamp: new Date("2023-01-01T00:01:30Z"), title: "Title B" },
        { game: "Game C", startTimestamp: new Date("2023-01-01T00:03:00Z"), title: "Title C" },
    ];
    const result = generateTimestampsText(categoriesArray);
    const expected = `00:00:00 Game A - Title A\n00:01:30 Game B - Title B\n00:03:00 Game C - Title C\n`;
    assertEquals(result, expected, "Should return correct timestamps for multiple categories");
});

Deno.test("generateTimestampsText - merging close categories", () => {
    const categoriesArray = [
        { game: "Game A", startTimestamp: new Date("2023-01-01T00:00:00Z"), title: "Title A" },
        { game: "Game B", startTimestamp: new Date("2023-01-01T00:01:30Z"), title: "Title A" },
        { game: "Game B", startTimestamp: new Date("2023-01-01T00:01:45Z"), title: "Title B" },
        { game: "Game B", startTimestamp: new Date("2023-01-01T00:03:00Z"), title: "Title C" },
        { game: "Game C", startTimestamp: new Date("2023-01-01T00:03:59Z"), title: "Title C" },
    ];
    const result = generateTimestampsText(categoriesArray);
    const expected = `00:00:00 Game A - Title A\n00:01:30 Game B - Title B\n00:03:00 Game C - Title C\n`;
    assertEquals(result, expected, "Should merge close categories and return correct timestamps");
});

Deno.test("generateTimestampsText - invalid timestamps in the middle", () => {
    const categoriesArray = [
        { game: "Game A", startTimestamp: new Date("2023-01-01T00:00:00Z"), title: "Title A" },
        { game: "Game B", startTimestamp: new Date("invalid"), title: "Title B" },
        { game: "Game C", startTimestamp: new Date("2023-01-01T00:02:00Z"), title: "Title C" },
    ];
    const result = generateTimestampsText(categoriesArray);
    const expected = `00:00:00 Game A - Title A\n00:02:00 Game C - Title C\n`;
    assertEquals(result, expected, "Should skip invalid timestamps and return correct timestamps");
});
