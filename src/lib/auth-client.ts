import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  genericOAuthClient,
  magicLinkClient,
  organizationClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    genericOAuthClient(),
    adminClient(),
    organizationClient(),
  ],
});
