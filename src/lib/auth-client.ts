import { createAuthClient } from "better-auth/react";
import {
  genericOAuthClient,
  magicLinkClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), genericOAuthClient()],
});
