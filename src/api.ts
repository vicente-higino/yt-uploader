import { GANYMEDE_PASSWORD, GANYMEDE_URL, GANYMEDE_USER } from "./main.ts";
import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

const cookieJar = new CookieJar();
export const fetchCookie = makeFetchCookie(
  fetch,
  cookieJar,
);

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
export async function deleteVOD(id: string) {
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
