import { handleApiRequest } from "../../server/shared/api-handler.js";

export default async (request, context) => {
  return handleApiRequest(request, {
    requestId: context.requestId,
  });
};

export const config = {
  path: [
    "/api/health",
    "/api/bootstrap",
    "/api/business-identity",
    "/api/business-settings",
    "/api/auth/signup",
    "/api/auth/login",
    "/api/auth/session",
    "/api/documents",
    "/api/documents/:id",
    "/api/documents/:id/duplicate",
    "/api/documents/:id/convert",
    "/api/documents/:id/shared",
  ],
};
