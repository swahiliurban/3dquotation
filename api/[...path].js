import { handleApiRequest } from "../server/shared/api-handler.js";

export default {
  fetch(request) {
    return handleApiRequest(request);
  },
};
