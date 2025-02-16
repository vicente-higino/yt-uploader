import { bgBrightRed } from "@std/fmt/colors";
import { parseArgs } from "@std/cli/parse-args";
import type { requestData } from "./main.ts";
import { check_live } from "./api.ts";
import { z } from "zod";

const args = parseArgs<{ delete?: boolean }>(Deno.args);
export const DELETE_FLAG = Deno.env.get("DELETE_FLAG") || args.delete || false; // if enabled files uploaded will be deleted

DELETE_FLAG &&
  console.log(`⚠️  ⚠️  ⚠️  ${bgBrightRed("DELETE_FLAG ENABLED")} ⚠️  ⚠️  ⚠️`);

export const DENO_ENV = z.enum(["PROD", "DEV"]).parse(Deno.env.get("DENO_ENV"));
export const GANYMEDE_URL = z.string().parse(Deno.env.get("GANYMEDE_URL"));
export const GANYMEDE_USER = z.string().parse(Deno.env.get("GANYMEDE_USER"));
export const GANYMEDE_PASSWORD = z.string().parse(Deno.env.get("GANYMEDE_PASSWORD"));
export const DISCORD_WEBHOOK_URL = z.string().parse(Deno.env.get("DISCORD_WEBHOOK_URL"));
export type { requestData };
export { check_live };
