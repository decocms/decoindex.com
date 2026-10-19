import { describe, expect, test } from "bun:test";
import { clientClass } from "./traffic";

describe("clientClass", () => {
  test("people", () => {
    expect(clientClass("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("browser");
    // Instagram's in-app browser is a person, even though it names an app.
    expect(clientClass("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0")).toBe("browser");
  });
  test("link previews are shares being pasted, not people", () => {
    expect(clientClass("WhatsApp/2.23.20.0 A")).toBe("preview");
    expect(clientClass("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe("preview");
  });
  test("bots and scripts", () => {
    expect(clientClass("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe("bot");
    expect(clientClass("curl/8.7.1")).toBe("bot");
    expect(clientClass("Mozilla/5.0 HeadlessChrome/130.0")).toBe("bot");
    expect(clientClass(null)).toBe("bot");
  });
});

describe("agentName", () => {
  test("names who it is, not the raw UA", async () => {
    const { agentName } = await import("./traffic");
    expect(agentName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0").name).toBe("iMessage");
    expect(agentName("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot").name).toBe("ChatGPT");
    expect(agentName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/147.0 Safari/537.36").name).toBe("Navegador automatizado");
    expect(agentName("Mozilla/5.0 (compatible; VarridaBot/1.0; +https://varrida.com/bot) Chrome/126").name).toBe("VarridaBot");
    expect(agentName("TelegramBot (like TwitterBot)").name).toBe("Telegram");
  });
});

describe("isDev", () => {
  test("our UA, the /dev cookie, or the test tag", async () => {
    const { isDev, DEV_UA } = await import("./traffic");
    const r = (h: Record<string, string>, q = "") => new Request(`https://shop.decoindex.com/${q}`, { headers: h });
    expect(isDev(r({ "user-agent": `Mozilla/5.0 HeadlessChrome ${DEV_UA}` }))).toBe(true);
    expect(isDev(r({ cookie: "a=1; decoshop_dev=1" }))).toBe(true);
    expect(isDev(r({}, "?utm_source=test"))).toBe(true);
    expect(isDev(r({ "user-agent": "Mozilla/5.0 Safari", cookie: "decoshop_dev=0" }))).toBe(false);
  });
});
