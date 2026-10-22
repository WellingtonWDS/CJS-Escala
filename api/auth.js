import { authResponse } from "../server/auth.js";
export default async function handler(req, res) {
  const origin = `https://${req.headers.host}`;
  const request = new Request(new URL("/api/auth", origin), {
    method: req.method,
    headers: req.headers,
    ...(req.method === "POST" ? { body: JSON.stringify(req.body) } : {}),
  });
  const response = await authResponse(request, process.env);
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(await response.text());
}
