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
