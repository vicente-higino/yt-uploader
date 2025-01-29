import { walk, existsSync } from "@std/fs";
import { TZDate } from "@date-fns/tz";
import { formatISO } from "date-fns";

function truncateString(str: string, maxLength: number = 100) {
  if (str.length + 33 > maxLength) {
    return str.slice(0, maxLength - 33 - 3) + "...";
  }
  return str;
}

async function makeThumbnail(text: string, path: string, outputPath: string) {
  console.log("creating thumbnail", text, path, outputPath);
  const command = new Deno.Command("ffmpeg", {
    args: [
      "-y",
      `-i`, path,
      `-vf`, `drawtext=text='${text}':fontcolor=white:fontsize=200:x=10:y=h-th-10:box=1:boxcolor=black@0.75:boxborderw=20:`,
      outputPath
    ]
  });
  const process = command.spawn();
  const { success, code, signal } = await process.status;

  console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
}

async function upload(videoInfo: { title: string; description: string; videoPath: string; thumbnailPath: string; }) {
  console.log("uploading video");
  const command = new Deno.Command("/app/youtubeuploader", {
    args: [
      `-filename`, videoInfo.videoPath,
      `-title`, videoInfo.title,
      `-description`, `${videoInfo.description}`,
      `-thumbnail`, `${videoInfo.thumbnailPath}`,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const process = command.spawn();

  process.stdout.pipeTo(Deno.stdout.writable, { preventClose: true, preventCancel: true, preventAbort: true });
  process.stderr.pipeTo(Deno.stderr.writable, { preventClose: true, preventCancel: true, preventAbort: true });
  const { success, code, signal } = await process.status;

  console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
}

async function uploadVideo() {
  const dirs = walk("/vods");

  for await (const file of dirs) {
    if (
      file.isFile && file.name.endsWith("info.json")
    ) {
      const data = JSON.parse(Deno.readTextFileSync(file.path));
      const date = formatISO(new TZDate(data.started_at, "America/Los_Angeles"), { representation: "date" })
      data.title = data.title.replaceAll("<", "＜").replaceAll(">", "＞");
      const videoPath = file.path.replace("-info.json", "-video.mp4");
      const thumbnailPath = file.path.replace("-info.json", "-thumbnail.jpg");
      const newThumbnailPath = file.path.replace("-info.json", "-thumbnail-new.jpg");
      const videoFileExists = existsSync(videoPath, { isFile: true });
      console.assert(videoFileExists, "video file does not exist");
      const title = `[${date}] ${truncateString(data.title)} [FUSLIE TWITCH VOD]`;
      const description = `Recording of the twitch stream for the original experience\n${data.title}\nVOD id: ${data.id}`;
      const videoInfo = { title, description, videoPath, thumbnailPath: newThumbnailPath };
      if (videoFileExists) {
        console.log(videoInfo);
        await makeThumbnail(date, thumbnailPath, newThumbnailPath);
        await upload(videoInfo);
      }

    }
  }
}

Deno.serve({ port: 8080 }, (req) => {
  console.log("Method:", req.method);

  const url = new URL(req.url);
  console.log("Path:", url.pathname);
  console.log("Query parameters:", url.searchParams);

  console.log("Headers:", req.headers);

  if (req.body) {

    uploadVideo();
  }

  return new Response("Hello, World!");
});


