import { existsSync } from "@std/fs";
import { assertExists } from "@std/assert";
import { TZDate } from "@date-fns/tz";
import { formatISO } from "date-fns";
import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { parseArgs } from "@std/cli/parse-args";
import { bgBrightRed } from "@std/fmt/colors";
const cookieJar = new CookieJar();
const fetchCookie = makeFetchCookie(
  fetch,
  cookieJar,
);

const args = parseArgs<{ delete?: boolean }>(Deno.args);
const DELETE_FLAG = Deno.env.get("DELETE_FLAG") || args.delete || false; // if enabled files uploaded will be deleted

DELETE_FLAG &&
  console.log(`⚠️  ⚠️  ⚠️  ${bgBrightRed("DELETE_FLAG ENABLED")} ⚠️  ⚠️  ⚠️`);

const GANYMEDE_URL = Deno.env.get("GANYMEDE_URL");
const GANYMEDE_USER = Deno.env.get("GANYMEDE_USER");
const GANYMEDE_PASSWORD = Deno.env.get("GANYMEDE_PASSWORD");
assertExists(GANYMEDE_URL, "missing GANYMEDE_URL env");
assertExists(GANYMEDE_USER, "missing GANYMEDE_USER env");
assertExists(GANYMEDE_PASSWORD, "missing GANYMEDE_PASSWORD env");

async function login() {
  const url = `http://${GANYMEDE_URL}/api/v1/auth/login`;

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: `{"username":"${GANYMEDE_USER}","password":"${GANYMEDE_PASSWORD}"}`,
  };

  try {
    await fetchCookie(url, options);
    // const json = await res.text();
    console.log("logged in");
    return;
  } catch (err) {
    return console.error("error:" + err);
  }
}

async function deleteVOD(id: string) {
  await login();

  const url = `http://${GANYMEDE_URL}/api/v1/vod/${id}?delete_files=true`;

  const options = {
    method: "DELETE",
  };

  try {
    await fetchCookie(url, options);
    // const json = await res.text();
    console.log("deleted vod:", id);
    return;
  } catch (err) {
    return console.error("error:" + err);
  }
}

function truncateString(
  str: string,
  channelNameLength: number,
  maxLength: number = 100,
) {
  if (str.length + (27 + channelNameLength) >= maxLength) {
    return str.slice(0, maxLength - (27 + channelNameLength) - 3) + "...";
  }
  return str;
}

function makeTitle(date: string, data: { title: string; user_name: string }) {
  return `[${date}] ${
    truncateString(data.title, data.user_name.length)
  } [${data.user_name.toUpperCase()} TWITCH VOD]`;
}

async function makeThumbnail(text: string, path: string, outputPath: string) {
  console.log("creating thumbnail", text, path, outputPath);
  const command = new Deno.Command("ffmpeg", {
    args: [
      "-y",
      `-i`,
      path,
      `-vf`,
      `drawtext=text='${text}':fontcolor=white:fontsize=200:x=10:y=h-th-10:box=1:boxcolor=black@0.75:boxborderw=20:`,
      outputPath,
    ],
  });
  const process = command.spawn();
  const { success, code, signal } = await process.status;

  console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
}

async function upload(
  videoInfo: {
    title: string;
    description: string;
    videoPath: string;
    thumbnailPath: string;
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
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const process = command.spawn();

  process.stdout.pipeTo(Deno.stdout.writable, {
    preventClose: true,
    preventCancel: true,
    preventAbort: true,
  });
  process.stderr.pipeTo(Deno.stderr.writable, {
    preventClose: true,
    preventCancel: true,
    preventAbort: true,
  });
  const { success, code, signal } = await process.status;

  console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
  return success;
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
  const videoFileExists = existsSync(videoPath, { isFile: true });
  console.assert(videoFileExists, "video file does not exist");
  const title = makeTitle(date, data);
  const description =
    `Recording of the twitch stream for the original experience\n${data.title}\nVOD id: ${data.id}`;
  const videoInfo = {
    title,
    description,
    videoPath,
    thumbnailPath: newThumbnailPath,
  };
  if (videoFileExists) {
    console.log(videoInfo);
    await makeThumbnail(date, thumbnailPath, newThumbnailPath);
    const success = await upload(videoInfo);
    success && DELETE_FLAG && await deleteVOD(id);
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

