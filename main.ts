import { serve } from "https://deno.land/std@0.198.0/http/server.ts";
import "https://deno.land/std@0.198.0/dotenv/load.ts"

type Handler = (request: Request) => Promise<Response> | Response;

const withAuthentication =
  (handler: Handler) => (request: Request): Response | Promise<Response> => {
    if (
      !request.headers.has("Authorization") ||
      request.headers.get("Authorization") !== Deno.env.get('AUTHORIZATION_TOKEN')
    ) {
      return new Response("Authentication failed", { status: 401 });
    }

    return handler(request);
  };

const handler: Handler = (request) => {
  if (
    request.method === "PUT" &&
    new URLPattern({ pathname: "/register" }).test(request.url)
  ) {
    return register(request);
  }

  const body = "This is commute logger app!\n";
  return new Response(body, { status: 200 });
};

const client = async <T extends Record<string, unknown>>(
  path: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const apiToken = Deno.env.get('NOTION_API_KEY');

  const res = await fetch(
    `https://api.notion.com/v1/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  return (await res.json()) as T;
};

const register = async (_: Request): Promise<Response> => {
  // retrieve latest page
  const databaseId = Deno.env.get('DATABASE_ID');
  const res = await client<{ results: { created_time: string }[] }>(
    `databases/${databaseId}/query`,
    "POST",
    {
      sorts: [
        { property: "Created time", direction: "descending" },
      ],
    },
  );
  console.log('res', res)
  const latestCreatedTime = res.results.at(0)?.created_time;
  if (
    latestCreatedTime && Date.now() - new Date(latestCreatedTime).getTime() <= 10 * 60 * 60 * 1000
  ) {
    return new Response(
      JSON.stringify({
        message: "You have already registered within 10 hours.",
        registered: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // register a log to notion
  await client("pages", "POST", {
    parent: { database_id: databaseId },
    properties: {
      Name: {
        title: [
          { text: { content: "test" } },
        ],
      },
    },
  });

  return new Response(
    JSON.stringify({
      message: "You have successfully registered.",
      registered: true,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

// Learn more at https://deno.land/manual/examples/module_metadata#concepts
if (import.meta.main) {
  console.log("Server listens on port 8000...");
  await serve(withAuthentication(handler), { port: 8000 });
}
