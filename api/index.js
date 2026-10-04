import { handleApiRequest } from "../server/shared/api-handler.js";

export default {
  fetch(request) {
    // Vercel routes nested API paths to this single function. Preserve the
    // requested operation rather than relying on a framework catch-all file.
    const url = new URL(request.url);
    const route = url.searchParams.get("route");
    if (route !== null) {
      url.pathname = `/api/${route}`;
      url.searchParams.delete("route");
      return handleApiRequest(new Request(url, request));
    }
    return handleApiRequest(request);
  },
};
