import "server-only";

/**
 * Thin DataForSEO HTTP client. DataForSEO uses HTTP Basic auth with the
 * account login as username and the API password as password. Same credentials
 * cover every endpoint family (SERP, Keyword Data, AI Optimization, etc.).
 *
 * Env: DATAFORSEO_USERNAME + DATAFORSEO_PASSWORD must be set in Vercel env.
 */

const BASE_URL = "https://api.dataforseo.com";

const getAuthHeader = (): string => {
  const username = process.env.DATAFORSEO_USERNAME;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!username || !password) {
    throw new Error("DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD must be set in env.");
  }
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
};

export type DataForSeoTaskResponse<T> = {
  status_code: number;
  status_message: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    cost: number;
    result_count: number;
    result: T[] | null;
  }>;
};

export const dataforseoPost = async <T>(
  path: string,
  body: unknown[],
): Promise<DataForSeoTaskResponse<T>> => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DataForSEO ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as DataForSeoTaskResponse<T>;
  if (json.status_code !== 20000) {
    throw new Error(`DataForSEO ${path} status ${json.status_code}: ${json.status_message}`);
  }
  return json;
};
