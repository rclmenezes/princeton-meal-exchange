type GraphUser = {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getGraphToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Microsoft Graph token request failed (${response.status}).`,
    );
  }

  const token = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  return cachedToken.value;
}

export async function searchGraphUsers(query: string) {
  const token = await getGraphToken();
  if (!token) return null;

  const params = new URLSearchParams({
    $search: `"displayName:${query.replaceAll('"', '\\"')}"`,
    $select: "id,displayName,mail,userPrincipalName",
    $top: "8",
    $count: "true",
  });
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Microsoft Graph search failed (${response.status}).`);
  }

  const body = (await response.json()) as { value: GraphUser[] };
  return body.value.filter(
    (person) => person.displayName && (person.mail || person.userPrincipalName),
  );
}
