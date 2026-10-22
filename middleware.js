import { next } from "@vercel/functions/middleware";
import { guard } from "./server/auth.js";
export default async function middleware(request) {
  return (
    (await guard(request, process.env)) ||
    next({ headers: { "Cache-Control": "private, no-store" } })
  );
}
