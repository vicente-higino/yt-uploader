import { assertEquals } from "jsr:@std/assert";
import { makeTitle } from "./makeTitle.ts";

Deno.test("makeTitle - ", () => {
    const date = "2026-01-02";
    const fullTitle = "❤️ HAPPY NEW YEAR! MINECRAFT... BUT WE HAVE SHARED HEALTH w/ RAE, LUD, SQUEEX!!!";
    const user_name = "fuslie";
    const title = makeTitle(date, { title: fullTitle, user_name });
    const g = [...title]
    console.log(title, g.length)
    assertEquals(g.length, 100);
});

