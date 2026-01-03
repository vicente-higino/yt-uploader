import { TZDate } from "@date-fns/tz";
import { makeTimestampsHandler } from "@scope/make-timespamps";
import { exists } from "@std/fs";
import { formatISO } from "date-fns";
import { z } from "zod";
import { deleteVOD, login } from "./api.ts";
import { makeTitle } from "./makeTitle.ts";
import type { videoUploadInfo } from "./videoUploadInfo.ts";
import { DELETE_FLAG, DISCORD_WEBHOOK_URL } from "./env.ts";

async function waitForFile(
  path: string,
  file: string,
  kind: "any" | "access" | "create" | "modify" | "rename" | "remove" | "other",
  timeout = 60000,
) {
  console.log("Waiting for file: ", file, kind, timeout);
  const watcher = Deno.watchFs(path);
  const timeoutID = setTimeout(() => {
    watcher.close();
  }, timeout);
  for await (const event of watcher) {
    if (event.kind == kind && (new Set(event.paths)).has(file)) {
      watcher.close();
      clearTimeout(timeoutID);
    }
  }
}

async function makeThumbnail(text: string, path: string, outputPath: string) {
  console.log("waiting for thumbnail to update... ⏳");
  await waitForFile(path, path, "modify", 10000);
  console.log("creating thumbnail", text, path, outputPath);
  const command = new Deno.Command("ffmpeg", {
    args: [
      "-y",
      `-i`,
      path,
      `-vf`,
      `drawtext=text='${text}':fontcolor=white:fontsize=(h/5.4):x=50:y=h-th-50:box=1:boxcolor=black@0.75:boxborderw=20:`,
      outputPath,
    ],
  });
  const process = command.spawn();
  const { success, code, signal } = await process.status;

  console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
}

async function sendSuccessNotification(metaJSONoutPath: string) {
  const metaJSONoutFileExists = await exists(metaJSONoutPath, { isFile: true });
  console.assert(metaJSONoutFileExists, "metaJSONout file does not exist");
  if (!metaJSONoutFileExists) return;
  const data = z.custom<videoUploadInfo>().parse(JSON.parse(
    await Deno.readTextFile(metaJSONoutPath),
  ));
  const url = DISCORD_WEBHOOK_URL!;
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "content": "@here, VOD uploaded successfully:",
      "embeds": [
        {
          "title": data.snippet.title,
          "description": data.snippet.description,
          "url": `https://youtu.be/${data.id}`,
          "color": 4961603,
          "fields": [
            {
              "name": "Click here to publish video",
              "value": `https://studio.youtube.com/video/${data.id}/edit`,
            },
          ],
          "image": {
            "url": data.snippet.thumbnails.high.url,
          },
        },
      ],
    }),
  };
  fetch(url, options);
}

function sendErrorNotification(errorMessage: string) {
  const url = DISCORD_WEBHOOK_URL!;
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "content": "@here ⚠️",
      "embeds": [
        {
          "id": 740234584,
          "title": "⚠️  ERROR UPLOADING VOD ⚠️",
          "description": `\`\`\`${errorMessage}\`\`\``,
          "color": 16711680,
          "fields": [],
        },
      ],
    }),
  };
  fetch(url, options);
}

function upload(
  videoInfo: {
    title: string;
    description: string;
    videoPath: string;
    thumbnailPath: string;
    metaJSONoutPath: string;
  },
) {
  console.log("uploading video");
  const command = new Deno.Command("youtubeuploader", {
    args: [
      `-filename`,
      videoInfo.videoPath,
      `-title`,
      videoInfo.title,
      `-description`,
      `${videoInfo.description}`,
      `-thumbnail`,
      `${videoInfo.thumbnailPath}`,
      "-metaJSONout",
      videoInfo.metaJSONoutPath,
    ],
  });
  const { success, code, signal, stderr, stdout } = command.outputSync();
  console.log(new TextDecoder().decode(stdout));
  console.log(new TextDecoder().decode(stderr));
  console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
  return success ? true : new TextDecoder().decode(stderr);
}

const infoFile = z.object({
  id: z.string(),
  user_name: z.string(),
  started_at: z.string().datetime(),
  title: z.string(),
});

function sanitizeString(str: string): string {
  return str.replaceAll("<", "＜").replaceAll(">", "＞");
}

interface VideoStreamInfo {
  startTime: Date;
  id: string;
  uniqueKey: string; // Add a unique key combining ID and start time
}

interface ChannelTrackingInfo {
  recentStreams: VideoStreamInfo[];
}

const videoTracking: Record<string, ChannelTrackingInfo> = {}; // Keyed by channelID

function trackLiveStream(data: requestData) {
  const { id, channelID } = data;

  try {
    // Use current timestamp instead of reading from the info file
    const currentTime = new Date();
    const startTimeMs = currentTime.getTime();
    const uniqueKey = `${id}_${startTimeMs}`;

    // Initialize tracking for this channel if it doesn't exist
    const trackingInfo = videoTracking[channelID] ??= { recentStreams: [] };

    // Check if we already have this stream ID tracked (we still need this check)
    const existingIndex = trackingInfo.recentStreams.findIndex(
      (stream) => stream.id === id && Math.abs(stream.startTime.getTime() - startTimeMs) < 60000, // Allow 1 minute difference
    );

    if (existingIndex >= 0) {
      console.log(`Stream ${id} already tracked with similar timestamp, skipping`);
      return;
    }

    // Add this stream to the tracking with the unique key based on current time
    trackingInfo.recentStreams.push({
      startTime: currentTime,
      id,
      uniqueKey,
    });

    // Sort all recent streams by start time
    trackingInfo.recentStreams.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Clean up old streams (older than 16 hours)
    const sixteenHoursAgo = new Date(Date.now() - 16 * 60 * 60 * 1000);
    trackingInfo.recentStreams = trackingInfo.recentStreams.filter(
      (stream) => stream.startTime > sixteenHoursAgo,
    );

    console.log(
      `Stream ${id} added to tracking at ${currentTime.toISOString()}. Current streams for channel ${channelID}:`,
      trackingInfo.recentStreams.map((s) => ({ id: s.id, startTime: s.startTime.toISOString() })),
    );
  } catch (error) {
    console.error(`Error tracking stream ${id}:`, error);
  }
}

async function uploadVideoWithID({ channel, id, channelID }: requestData) {
  const folderPath = `/vods/${channel}/${id}`;
  const infoFilePath = `${folderPath}/${id}-info.json`;
  const videoPath = `${folderPath}/${id}-video.mp4`;
  const thumbnailPath = `${folderPath}/${id}-thumbnail.jpg`;
  const newThumbnailPath = `${folderPath}/${id}-thumbnail-new.jpg`;
  const metaJSONoutPath = `${folderPath}/${id}-upload-info.json`;
  const timestampPath = `${folderPath}/${id}-timestamps.txt`;
  console.log(infoFilePath);
  const infoFileExists = await exists(infoFilePath, { isFile: true });
  console.assert(infoFileExists, "info file does not exist");
  if (!infoFileExists) return;
  const { success, data: infoFileData } = infoFile.safeParse(JSON.parse(await Deno.readTextFile(infoFilePath)));
  if (!success) return;

  const startTime = new TZDate(infoFileData.started_at, "America/Los_Angeles");
  const date = formatISO(startTime, {
    representation: "date",
  });
  infoFileData.title = sanitizeString(infoFileData.title);

  // --- Modified Part Tracking Logic ---
  // Get the tracking info but don't add the stream here (it should have been added in /live)
  const trackingInfo = videoTracking[channelID];

  let currentPartNumber = 1;
  if (trackingInfo && trackingInfo.recentStreams.length > 0) {
    // Look for any stream with matching ID - don't rely on exact timestamp match
    const matchingStreams = trackingInfo.recentStreams.filter((stream) => stream.id === id);

    if (matchingStreams.length > 0) {
      // Use the first tracked instance of this stream ID
      // The list is already sorted by startTime, so this preserves chronological order
      const streamIndex = trackingInfo.recentStreams.indexOf(matchingStreams[0]);
      currentPartNumber = streamIndex + 1;

      console.log(`Found stream ${id} at position ${streamIndex}, part number: ${currentPartNumber}`);
    } else {
      // If stream wasn't tracked during /live, add it now with a current timestamp
      console.log(`Stream ${id} wasn't tracked during /live, adding it now`);
      const currentTime = new Date();
      const uniqueKey = `${id}_${currentTime.getTime()}`;

      trackingInfo.recentStreams.push({
        startTime: currentTime,
        id,
        uniqueKey,
      });
      trackingInfo.recentStreams.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      currentPartNumber = trackingInfo.recentStreams.findIndex((stream) => stream.id === id) + 1;
    }
  } else {
    // If no tracking info exists, initialize it with current time
    const currentTime = new Date();
    const uniqueKey = `${id}_${currentTime.getTime()}`;

    videoTracking[channelID] = {
      recentStreams: [{
        startTime: currentTime,
        id,
        uniqueKey,
      }],
    };
  }
  // --- End Modified Part Tracking Logic ---

  const timespampsFileExists = await exists(timestampPath, { isFile: true });
  !timespampsFileExists && await waitForFile(folderPath, timestampPath, "create", 5000);
  console.assert(timespampsFileExists, "timespamps file does not exist");
  const timestamps = timespampsFileExists ? sanitizeString(await Deno.readTextFile(timestampPath)) : "";
  const videoFileExists = await exists(videoPath, { isFile: true });
  console.assert(videoFileExists, "video file does not exist");
  const title = makeTitle(date, infoFileData, currentPartNumber);
  // deno-fmt-ignore
  const description =
    `Help support the channel: https://ko-fi.com/fuslietwitchvodswithmusic \n\n` +
    `[FULL TITLE]\n` +
    `${infoFileData.title}\n\n` +
    `[TIMESTAMPS]\n` +
    `${timestamps}\n` +
    `VOD id: ${infoFileData.id}\n`;
  const videoInfo = {
    title, // Use the title generated by makeTitle
    description,
    videoPath,
    thumbnailPath: newThumbnailPath,
    metaJSONoutPath,
  };
  if (videoFileExists) {
    console.log(videoInfo);
    await makeThumbnail(date, thumbnailPath, newThumbnailPath);
    const successOrErrorMessage = upload(videoInfo);
    if (successOrErrorMessage === true) {
      sendSuccessNotification(metaJSONoutPath);
      DELETE_FLAG && await deleteVOD(id);
    } else {
      sendErrorNotification(successOrErrorMessage);
      // Don't remove from tracking on failure - the video order is still valid
    }
  }
}

const requestBody = z.object({
  body: z.string().transform((str) => {
    return z.object({
      channel: z.string().min(3).toLowerCase(),
      channelID: z.string().refine((str) => z.coerce.number().safeParse(str).success),
      id: z.string().uuid(),
      queueId: z.string().uuid(),
    }).parse(JSON.parse(str));
  }),
});

export type requestData = z.infer<typeof requestBody.shape.body>;
login();
Deno.serve({ port: 8080 }, async (req) => {
  const url = new URL(req.url);
  // Log request method, path, and query parameters together
  console.log(`Received request: ${req.method} ${url.pathname}${url.search}`);

  // Headers logging removed for brevity, uncomment if needed for debugging
  // console.log("Headers:", req.headers);

  if (req.body) {
    try {
      const body = await req.json();
      console.log("Request body:", body); // Log the raw body

      const { success, data, error } = requestBody.safeParse(body); // Use safeParse
      if (success) {
        console.log("Validated data:", data.body); // Log the validated data
        makeTimestampsHandler(url.pathname, data.body);
        if (url.pathname == "/live") {
          // Track the stream when it goes live
          console.log(`Live event received for channel ${data.body.channelID}, video ${data.body.id}`);
          trackLiveStream(data.body);
        } else if (url.pathname == "/offline") {
          uploadVideoWithID(data.body); // Pass the full data object
        }
      } else {
        // Log validation errors
        console.error("Request body validation failed:", error.issues);
      }
    } catch (e) {
      console.error("Failed to parse request body as JSON:", e);
      // Consider returning an error response, e.g.:
      // return new Response("Invalid JSON body", { status: 400 });
    }
  } else {
    console.log("Request has no body.");
  }
  return new Response("ok");
});
