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

async function uploadVideoWithID({ channel, id }: requestData) {
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
  const date = formatISO(new TZDate(infoFileData.started_at, "America/Los_Angeles"), {
    representation: "date",
  });
  infoFileData.title = sanitizeString(infoFileData.title);
  const timespampsFileExists = await exists(timestampPath, { isFile: true });
  !timespampsFileExists && await waitForFile(folderPath, timestampPath, "create", 5000);
  console.assert(timespampsFileExists, "timespamps file does not exist");
  const timespamps = timespampsFileExists ? sanitizeString(await Deno.readTextFile(timestampPath)) : "";
  const videoFileExists = await exists(videoPath, { isFile: true });
  console.assert(videoFileExists, "video file does not exist");
  const title = makeTitle(date, infoFileData);
  // deno-fmt-ignore
  const description = `Recording of the twitch stream for the original experience\n` + 
                      `${infoFileData.title}\n`                                      + 
                      `\n${timespamps}\n`                                            + 
                      `VOD id: ${infoFileData.id}`;
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
    successOrErrorMessage === true && DELETE_FLAG && await deleteVOD(id);
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
setInterval(login, 24 * 60 * 60 * 1000);

Deno.serve({ port: 8080 }, async (req) => {
  console.log("Method:", req.method);
  const url = new URL(req.url);
  console.log("Path:", url.pathname);
  console.log("Query parameters:", url.searchParams);

  console.log("Headers:", req.headers);

  if (req.body) {
    const body = await req.json();
    console.log(body);

    const { success, data } = requestBody.safeParse(body);
    if (success) {
      console.log(data);
      makeTimestampsHandler(url.pathname, data.body);
      if (url.pathname == "/offline") uploadVideoWithID(data.body);
    }
  }
  return new Response("ok");
});
