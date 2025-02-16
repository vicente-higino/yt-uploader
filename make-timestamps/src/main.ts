import { check_live, DENO_ENV, type requestData } from "@scope/main";
import { assertExists } from "@std/assert/exists";
import { difference } from "@std/datetime/difference";
import { format } from "@std/fmt/duration";
import { ApiClient } from "@twurple/api";
import { AppTokenAuthProvider } from "@twurple/auth";
import { EventSubHttpListener, ReverseProxyAdapter } from "@twurple/eventsub-http";
import { z } from "zod";

const CLIENT_ID = z.string().parse(Deno.env.get("CLIENT_ID"));
const CLIENT_SECRET = z.string().parse(Deno.env.get("CLIENT_SECRET"));
const REVERSEPROXY_URL = z.string().optional().parse(Deno.env.get("REVERSEPROXY_URL"));
DENO_ENV == "PROD" && assertExists(REVERSEPROXY_URL, "missing REVERSEPROXY_URL env");
const REVERSEPROXY_PORT = z.coerce.number().optional().parse(Deno.env.get("REVERSEPROXY_PORT"));
DENO_ENV == "PROD" && assertExists(REVERSEPROXY_PORT, "missing REVERSEPROXY_PORT env");
const REVERSEPROXY_SECRET = z.string().parse(Deno.env.get("REVERSEPROXY_SECRET"));
const NGROK_AUTH_TOKEN = z.string().optional().parse(Deno.env.get("NGROK_AUTH_TOKEN"));
DENO_ENV == "DEV" && assertExists(NGROK_AUTH_TOKEN, "missing NGROK_AUTH_TOKEN env");

const clientId = CLIENT_ID;
const clientSecret = CLIENT_SECRET;
const authProvider = new AppTokenAuthProvider(clientId, clientSecret);

const apiClient = new ApiClient({ authProvider });

await apiClient.eventSub.deleteAllSubscriptions();

const adapter = async () => {
  if (DENO_ENV == "PROD") {
    return new ReverseProxyAdapter({
      hostName: REVERSEPROXY_URL!, // The host name the server is available from
      port: REVERSEPROXY_PORT, // The port to listen on, defaults to 8080
    });
  }
  const { NgrokAdapter } = await import("@twurple/eventsub-ngrok");
  return new NgrokAdapter!({
    ngrokConfig: {
      authtoken: NGROK_AUTH_TOKEN,
    },
  });
};
const listener = new EventSubHttpListener({
  apiClient,
  adapter: await adapter(),
  logger: {
    minLevel: "debug",
  },
  secret: REVERSEPROXY_SECRET,
});

listener.start();

const onlineSubscription = listener.onStreamOnline("83402203", (e) => {
  check_live();
  console.log(`${e.broadcasterDisplayName} just went live!`);
});
console.log(await onlineSubscription.getCliTestCommand());

function toHHMMSS(secs: number): string {
  const hours = Math.floor(secs / 3600);
  const minutes = Math.floor(secs / 60) % 60;
  const seconds = secs % 60;
  return [hours, minutes, seconds]
    .map((v) => v < 10 ? "0" + v : v)
    .join(":");
}

type categoriesArray = { game: string; startTimestamp: Date; title: string }[];

async function onStreamOnline(channelID: string, channelName: string, categoryArr: categoriesArray) {
  const user = await apiClient.users.getUserById(channelID);
  if (!user) {
    console.log("no user found: ", channelName);
    return;
  }
  const stream = await user.getStream();
  if (!stream) {
    console.log(`no stream found for user: ${user.displayName}`);
    return;
  }
  console.log(user.id, user.displayName, stream?.title, stream?.gameName, stream?.viewers, stream?.startDate);
  categoryArr.push({ game: stream?.gameName!, startTimestamp: new Date(), title: stream.title });
  const sub = listener.onChannelUpdate(user.id, (e) => {
    const date = new Date();
    const last = categoryArr.at(-1);
    if (last && (last.game !== e.categoryName || last.title !== e.streamTitle)) {
      categoryArr.push({ game: e.categoryName, startTimestamp: new Date(), title: e.streamTitle });
      console.log(
        e.broadcasterDisplayName,
        e.streamTitle,
        e.categoryName,
        date.toJSON(),
        format(difference(last.startTimestamp!, date).milliseconds!, { ignoreZero: true }),
      );
    }
  });
  return sub;
}

async function onStreamOffline(
  categoriesArray: categoriesArray,
  pathToSave: string,
  onChannelUpdateID: Promise<ReturnType<typeof listener.onChannelUpdate> | undefined>,
) {
  console.log(categoriesArray);
  const subID = await onChannelUpdateID;
  subID && console.log("deleting subscription with id: ", subID.id);
  subID && subID.stop();
  const first = categoriesArray[0];
  let text = "";
  for (const category of categoriesArray) {
    const time = difference(category.startTimestamp, first.startTimestamp).seconds!;
    const timestamp = `${toHHMMSS(time)} ${category.game} - ${category.title}\n`;
    text += timestamp;
    console.log(timestamp);
  }
  Deno.writeTextFile(pathToSave, text);
}

function makeTimestamps(id: string, channelID: string, channelName: string) {
  const path = `/vods/${channelName.toLowerCase()}/${id}/${id}-timestamps.txt`;
  const categoriesArray: categoriesArray = [];
  const onUpdateSubID = onStreamOnline(channelID, channelName, categoriesArray);
  return () => onStreamOffline(categoriesArray, path, onUpdateSubID);
}

async function handleExit() {
  console.log("stopping...");
  // for (const func of Object.values(onOffline)) {
  //   await func();
  // }
  await Promise.all(Object.values(onOffline).map((f) => f()));
  listener.stop();
  Deno.exit();
}

Deno.addSignalListener("SIGINT", handleExit);
Deno.addSignalListener("SIGTERM", handleExit);
Deno.addSignalListener("SIGQUIT", handleExit);

const onOffline: { [chanellID: string]: ReturnType<typeof makeTimestamps> } = {};
export const makeTimestampsHandler = (pathname: string, data: requestData) => {
  if (pathname === "/live") {
    console.log(data);
    onOffline[data.queueId] = makeTimestamps(data.id, data.channelID, data.channel);
  }
  if (pathname === "/offline") {
    console.log(data);
    if (data.queueId in onOffline) {
      onOffline[data.queueId]();
      delete onOffline[data.queueId];
    }
  }
};
