import { walk } from "@std/fs";
import { copy, readerFromStreamReader } from "@std/io";

function truncateString(str: string, maxLength: number = 100) {
  if (str.length + 31 > maxLength) {
    return str.slice(0, maxLength - 3 - 31 - 1) + "...";
  }
  return str;
}

type videoInfo = {
  title: string;
  description: string;
};

async function uploadVideo(videoInfo: videoInfo) {
  const dirs = walk("/vods");

  for await (const file of dirs) {
    if (
      file.isFile && file.name.endsWith(".mp4")
    ) {
      console.log(file.isFile, file.name);
      const command = new Deno.Command("/app/youtubeuploader", {
        args: [
          `-filename`, file.path,
          `-title`, videoInfo.title,
          `-description`, `${videoInfo.description}${file.name.replace("-video.mp4", "")}`,
        ],
        stdout: "piped",
        stderr: "piped",
      });
      const process = command.spawn();
      
      process.stdout.pipeTo(Deno.stdout.writable, { preventClose: true, preventCancel: true, preventAbort: true});
      process.stderr.pipeTo(Deno.stderr.writable, { preventClose: true, preventCancel: true, preventAbort: true});
      const { success, code, signal } = await process.status;

      console.log(`done! success: ${success} code: ${code} signal: ${signal}`);
      // copy(readerFromStreamReader(child.stdout.getReader()), Deno.stdout);

      // create subprocess and collect output
      // const { code, stdout, stderr } = await command.output();

      // console.assert(code === 0);
      // console.log(new TextDecoder().decode(stdout));
      // console.log(new TextDecoder().decode(stderr));
      // console.log(file.isFile, file.name);
    }
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
    console.log(body);
    const data = JSON.parse(body.body);
    data.title = data.title.replaceAll("<", "＜").replaceAll(">", "＞");
    const title = `[${data.date.slice(0, 10)}] ${truncateString(data.title)
      } [FUSLIE TWITCH VOD]`;
    const description =
      `Recording of the twitch stream for the original experience\n${data.title}\nVOD id: `;
    const videoInfo = { title, description };
    console.log(videoInfo);
    uploadVideo(videoInfo);
  }

  return new Response("Hello, World!");
});
