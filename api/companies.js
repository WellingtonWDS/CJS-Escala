import { handleVercel } from "../server/vercel-adapter.js";
export default (req, res) => handleVercel(req, res, "/api/companies");
