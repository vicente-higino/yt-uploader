import { GANYMEDE_PASSWORD, GANYMEDE_URL, GANYMEDE_USER } from "./env.ts";
import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

const cookieJar = new CookieJar();
const fetchCookie = makeFetchCookie(
  fetch,
  cookieJar,
);

export async function login() {
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

export async function deleteVOD(id: string) {
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
export async function check_live() {
  const url = `http://${GANYMEDE_URL}/api/v1/task/start`;

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "task": "check_live",
    }),
  };

  try {
    await fetchCookie(url, options);
    // const json = await res.text();
    console.log("checking for live stream");
    return;
  } catch (err) {
    return console.error("error:" + err);
  }
}
