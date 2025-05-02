import { check_live, DENO_ENV, type requestData } from "@scope/main";
import { assertExists } from "@std/assert/exists";
import { difference } from "@std/datetime/difference";
import { format } from "@std/fmt/duration";
import { ApiClient } from "@twurple/api";
import { AppTokenAuthProvider } from "@twurple/auth";
// Import EventSubSubscription type
import { EventSubHttpListener, ReverseProxyAdapter } from "@twurple/eventsub-http";
import { z } from "zod";
import { generateTimestampsText } from "./generateTimestampsText.ts";
import type { categoriesArray } from "./misc.ts";

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

// --- Refactored State Management ---
// Update Map type to store the actual subscription object
const channelUpdateSubscriptions = new Map<string, ReturnType<typeof listener.onChannelUpdate>>();
type ActiveSession = {
  queueId: string;
  channelID: string;
  channelName: string;
  categoriesArray: categoriesArray;
  path: string;
};
const activeSessions = new Map<string, ActiveSession>();
// --- End Refactored State Management ---

// --- New Function: Ensure Subscription ---
async function ensureChannelUpdateSubscription(channelID: string) {
  // Check if we have a subscription locally
  if (channelUpdateSubscriptions.has(channelID)) {
    const existingSub = channelUpdateSubscriptions.get(channelID)!;
    let isApiActive = false;
    try {
      // Verify with the API if the subscription is still active among all enabled subscriptions
      console.log(`Verifying status of subscription ${existingSub.id} for channel ${channelID} via API...`);
      const enabledSubsPaginator = apiClient.eventSub.getSubscriptionsForStatusPaginated("enabled");
      // Iterate through all pages of enabled subscriptions
      for await (const apiSub of enabledSubsPaginator) {
        console.log(`Checking subscription ID ${apiSub.id}...`);
        if (apiSub.id === existingSub._twitchId) {
          console.log(`Subscription ${existingSub._twitchId} for channel ${channelID} confirmed active via API.`);
          isApiActive = true;
          break; // Found the active subscription, no need to check further
        }
      }

      if (isApiActive) {
        return; // Subscription exists locally and is active on Twitch API
      } else {
        // If the loop finishes without finding the sub ID, it's not active
        console.warn(
          `Subscription ${existingSub.id} for channel ${channelID} found locally but is not listed as 'enabled' on Twitch API. Removing local entry.`,
        );
        // Attempt to stop the local listener instance if it exists, in case it's somehow orphaned
        // try {
        //   existingSub.stop();
        //   // Add a 5-second delay
        //   await new Promise((resolve) => setTimeout(resolve, 5000));
        // } catch (stopError) {
        //   console.error(`Error stopping potentially orphaned local subscription ${existingSub.id}:`, stopError);
        // }
        channelUpdateSubscriptions.delete(channelID);
      }
    } catch (error) {
      console.error(
        `Failed to verify subscription ${existingSub.id} status with API using getSubscriptionsForStatus for channel ${channelID}. Error: ${error}. Removing local entry.`,
      );
      channelUpdateSubscriptions.delete(channelID);
    }
  }

  // If we reach here, either no local subscription exists or the existing one was invalid/inactive
  console.log(`Creating ChannelUpdate subscription for ${channelID}`);
  try {
    // Await the creation and store the actual subscription object
    const newSubscription = listener.onChannelUpdate(channelID, (e) => {
      const date = new Date();
      console.log(
        `ChannelUpdate event for ${e.broadcasterDisplayName} (${e.broadcasterId}): Title='${e.streamTitle}', Category='${e.categoryName}'`,
      );

      // Find all active sessions for this channel and update their category arrays
      for (const session of activeSessions.values()) {
        if (session.channelID === e.broadcasterId) {
          const last = session.categoriesArray.at(-1);
          if (last && (last.game !== e.categoryName || last.title !== e.streamTitle)) {
            session.categoriesArray.push({ game: e.categoryName, startTimestamp: date, title: e.streamTitle });
            console.log(
              `[${session.queueId}] Updated category for ${e.broadcasterDisplayName}: ${e.categoryName} - ${e.streamTitle}`,
              `(${
                format(difference(last.startTimestamp!, date).milliseconds!, { ignoreZero: true })
              } since last change)`,
            );
          } else if (!last) {
            // Should not happen if /live handler works correctly, but handle defensively
            session.categoriesArray.push({ game: e.categoryName, startTimestamp: date, title: e.streamTitle });
            console.warn(
              `[${session.queueId}] Categories array was empty for ${e.broadcasterDisplayName}, added initial entry from update.`,
            );
          }
        }
      }
    });
    // Store the created subscription object
    channelUpdateSubscriptions.set(channelID, newSubscription);
    console.log(`ChannelUpdate subscription created for ${channelID} with ID: ${newSubscription.id}`);
    console.log(await newSubscription.getCliTestCommand()); // Log test command for the new subscription
  } catch (error) {
    console.error(`Failed to create ChannelUpdate subscription for ${channelID}:`, error);
    // Optionally re-throw or handle the error appropriately
  }
}
// --- End New Function ---

// --- Refactored onStreamOffline ---
async function onStreamOffline(categoriesArray: categoriesArray, pathToSave: string) {
  if (categoriesArray.length === 0) {
    console.log(`No categories recorded for path: ${pathToSave}. Skipping file write.`);
    return;
  }
  console.log(`Processing timestamps for path: ${pathToSave}`);
  console.log("Categories recorded:", categoriesArray);

  // Generate the timestamps text
  const timestampsText = generateTimestampsText(categoriesArray);
  if (!timestampsText) {
    console.error(`Failed to generate timestamps for path: ${pathToSave}`);
    return;
  }

  try {
    // Ensure directory exists before writing
    const dir = pathToSave.substring(0, pathToSave.lastIndexOf("/"));
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(pathToSave, timestampsText);
    console.log(`Timestamps successfully written to ${pathToSave}`);
  } catch (error) {
    console.error(`Error writing timestamp file to ${pathToSave}:`, error);
  }
}

// --- End Refactored onStreamOffline ---

async function handleExit() {
  console.log("Stopping...");

  // Process remaining active sessions
  console.log(`Processing ${activeSessions.size} remaining active sessions before exit...`);
  const offlinePromises = [];
  for (const session of activeSessions.values()) {
    console.log(`Triggering offline processing for session: ${session.queueId}`);
    offlinePromises.push(onStreamOffline(session.categoriesArray, session.path));
  }
  await Promise.all(offlinePromises);
  activeSessions.clear(); // Clear sessions after processing

  // Stop channel update subscriptions stored in the map
  console.log(`Stopping ${channelUpdateSubscriptions.size} channel update subscriptions...`);
  const stopPromises = [];
  for (const [channelID, sub] of channelUpdateSubscriptions.entries()) {
    // sub is now the EventSubSubscription object
    console.log(`Stopping subscription for channel ${channelID} (ID: ${sub.id})`);
    // Use the stop method directly on the subscription object
    stopPromises.push(sub.stop());
  }
  await Promise.all(stopPromises);
  channelUpdateSubscriptions.clear();

  // Stop the main listener
  console.log("Stopping main EventSub listener...");
  await listener.stop(); // Ensure listener stop is awaited if it's async

  console.log("Cleanup complete. Exiting.");
  Deno.exit();
}

Deno.addSignalListener("SIGINT", handleExit);
Deno.addSignalListener("SIGTERM", handleExit);
Deno.addSignalListener("SIGQUIT", handleExit);

export const makeTimestampsHandler = async (pathname: string, data: requestData) => {
  console.log(`Received request: ${pathname} with data:`, data);

  if (pathname === "/live") {
    if (activeSessions.has(data.queueId)) {
      console.warn(`Session with queueId ${data.queueId} already exists. Ignoring duplicate /live request.`);
      return;
    }

    try {
      // Ensure the channel update listener is running for this channel
      await ensureChannelUpdateSubscription(data.channelID);

      // Fetch initial stream state
      const user = await apiClient.users.getUserById(data.channelID);
      if (!user) {
        console.error(`Could not find user for channel ID: ${data.channelID}`);
        return;
      }
      const stream = await user.getStream();
      if (!stream) {
        console.warn(
          `User ${user.displayName} (${data.channelID}) is not currently live. Cannot start timestamping session ${data.queueId}.`,
        );
        // Optionally, you could still create the session but with an empty array,
        // relying on the ChannelUpdate event to populate it if they go live later.
        // However, the current logic assumes they are live when /live is called.
        return;
      }

      console.log(
        `Starting timestamp session ${data.queueId} for ${user.displayName}. Initial state: Game='${stream.gameName}', Title='${stream.title}'`,
      );

      // Create the initial categories array for this session
      const categoriesArray: categoriesArray = [
        { game: stream.gameName, startTimestamp: new Date(), title: stream.title },
      ];

      // Define the path for the timestamp file
      const path = `/vods/${data.channel.toLowerCase()}/${data.id}/${data.id}-timestamps.txt`;

      // Store the active session data
      activeSessions.set(data.queueId, {
        queueId: data.queueId,
        channelID: data.channelID,
        channelName: data.channel,
        categoriesArray: categoriesArray,
        path: path,
      });

      console.log(`Active session ${data.queueId} started for ${data.channel}. Path: ${path}`);
    } catch (error) {
      console.error(`Error processing /live request for queueId ${data.queueId}:`, error);
    }
  } else if (pathname === "/offline") {
    const session = activeSessions.get(data.queueId);
    if (session) {
      console.log(`Processing /offline for session: ${data.queueId}`);
      // Process the collected data and write the file
      await onStreamOffline(session.categoriesArray, session.path);
      // Remove the session from active tracking
      activeSessions.delete(data.queueId);
      console.log(`Session ${data.queueId} finished and removed.`);
    } else {
      console.warn(`Received /offline for unknown or already processed queueId: ${data.queueId}`);
    }
  } else {
    console.log(`Unknown pathname received: ${pathname}`);
  }
};
