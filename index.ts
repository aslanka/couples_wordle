import { registerRootComponent } from "expo";

const nativeFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url;

  if (!url?.startsWith("https://api.dictionaryapi.dev/api/v2/entries/en/")) {
    return nativeFetch(input, init);
  }

  const word = decodeURIComponent(url.split("/").pop() || "").toLowerCase();

  const lookup = nativeFetch(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=10`,
    init
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error("Word check is unavailable right now. Try again.");
    }

    const results = await response.json();
    const valid =
      Array.isArray(results) &&
      results.some(
        (result: any) =>
          String(result?.word || "").toLowerCase() === word &&
          Array.isArray(result?.defs) &&
          result.defs.length > 0
      );

    return {
      status: valid ? 200 : 404,
      ok: valid,
    } as Response;
  });

  const timeout = new Promise<Response>((_, reject) => {
    setTimeout(() => reject(new Error("Word check timed out. Try again.")), 4000);
  });

  return Promise.race([lookup, timeout]);
}) as typeof globalThis.fetch;

const App = require("./App").default;

registerRootComponent(App);
