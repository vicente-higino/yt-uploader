import { existsSync } from "@std/fs";
import { assertExists } from "@std/assert";
import { TZDate } from "@date-fns/tz";
import { formatISO } from "date-fns";
import { parseArgs } from "@std/cli/parse-args";
import { bgBrightRed } from "@std/fmt/colors";
import type { videoUploadInfo } from "./videoUploadInfo.ts";
import { makeTitle } from "./makeTitle.ts";
import { deleteVOD } from "./api.ts";

const args = parseArgs<{ delete?: boolean }>(Deno.args);
const DELETE_FLAG = Deno.env.get("DELETE_FLAG") || args.delete || false; // if enabled files uploaded will be deleted

DELETE_FLAG &&
  console.log(`⚠️  ⚠️  ⚠️  ${bgBrightRed("DELETE_FLAG ENABLED")} ⚠️  ⚠️  ⚠️`);

export const GANYMEDE_URL = Deno.env.get("GANYMEDE_URL");
export const GANYMEDE_USER = Deno.env.get("GANYMEDE_USER");
export const GANYMEDE_PASSWORD = Deno.env.get("GANYMEDE_PASSWORD");
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");
assertExists(GANYMEDE_URL, "missing GANYMEDE_URL env");
assertExists(GANYMEDE_USER, "missing GANYMEDE_USER env");
assertExists(GANYMEDE_PASSWORD, "missing GANYMEDE_PASSWORD env");
assertExists(DISCORD_WEBHOOK_URL, "missing DISCORD_WEBHOOK_URL env");

async function makeThumbnail(text: string, path: string, outputPath: string) {
  console.log("waiting for thumbnail to update... ⏳");
  const watcher = Deno.watchFs(path);
  const timeoutID = setTimeout(() => {
    watcher.close();
  }, 60000);
  for await (const event of watcher) { // waiting for thumbnail to update before creating new thumbnail
    if (event.kind == "modify") {
      watcher.close();
      clearTimeout(timeoutID);
    }
  }
  console.log("creating thumbnail", text, path, outputPath);
  const command = new Deno.Command("ffmpeg", {
    args: [
      "-y",
      `-i`,
      path,
      `-vf`,
      `drawtext=text='${text}':fontcolor=white:fontsize=200:x=50:y=h-th-50:box=1:boxcolor=black@0.75:boxborderw=20:`,
      outputPath,
    ],
  });
  const process = command.spawn();
  const { success, code, signal } = await process.status;

  console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
}

function sendSuccessNotification(metaJSONoutPath: string) {
  const metaJSONoutFileExists = existsSync(metaJSONoutPath, { isFile: true });
  console.assert(metaJSONoutFileExists, "metaJSONout file does not exist");
  if (!metaJSONoutFileExists) return;
  const data: videoUploadInfo = JSON.parse(
    Deno.readTextFileSync(metaJSONoutPath),
  );
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

async function uploadVideoWithID(channel: string, id: string) {
  const path = `/vods/${channel}/${id}/${id}-info.json`;
  console.log(path);
  const infoFileExists = existsSync(path, { isFile: true });
  console.assert(infoFileExists, "info file does not exist");
  if (!infoFileExists) return;
  const data = JSON.parse(Deno.readTextFileSync(path));
  const date = formatISO(new TZDate(data.started_at, "America/Los_Angeles"), {
    representation: "date",
  });
  data.title = data.title.replaceAll("<", "＜").replaceAll(">", "＞");
  const videoPath = path.replace("-info.json", "-video.mp4");
  const thumbnailPath = path.replace("-info.json", "-thumbnail.jpg");
  const newThumbnailPath = path.replace("-info.json", "-thumbnail-new.jpg");
  const metaJSONoutPath = path.replace("-info.json", "-upload-info.json");
  const videoFileExists = existsSync(videoPath, { isFile: true });
  console.assert(videoFileExists, "video file does not exist");
  const title = makeTitle(date, data);
  const description = `Recording of the twitch stream for the original experience\n${data.title}\nVOD id: ${data.id}`;
  const videoInfo = {
    title,
    description,
    videoPath,
    thumbnailPath: newThumbnailPath,
    metaJSONoutPath,
  };
  if (videoFileExists) {
    console.log(videoInfo);
    await makeThumbnail(date, thumbnailPath, newThumbnailPath);
    const successOrErrorMessage = upload(videoInfo);
    successOrErrorMessage === true
      ? sendSuccessNotification(metaJSONoutPath)
      : sendErrorNotification(successOrErrorMessage);
    successOrErrorMessage && DELETE_FLAG && await deleteVOD(id);
  }
}

Deno.serve({ port: 8080 }, async (req) => {
  console.log("Method:", req.method);

  const url = new URL(req.url);
  console.log("Path:", url.pathname);
  console.log("Query parameters:", url.searchParams);

  console.log("Headers:", req.headers);

  if (req.body) {
    const body = await req.json();
    const data = JSON.parse(body.body);
    uploadVideoWithID(data.channel.toLowerCase(), data.id);
  }

  return new Response("ok");
});
