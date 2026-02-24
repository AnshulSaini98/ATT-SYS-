// Scanner may return plain token, JSON payload, or URL with sessionToken query.
export const extractSessionToken = (rawValue) => {
  const normalizedValue = String(rawValue || "").trim();
  if (!normalizedValue) {
    return "";
  }

  try {
    const parsedValue = JSON.parse(normalizedValue);
    if (typeof parsedValue === "string") {
      return parsedValue;
    }
    if (parsedValue.sessionToken) {
      return parsedValue.sessionToken;
    }
  } catch (_error) {
    // Not JSON, continue with URL/plain text checks.
  }

  try {
    const parsedUrl = new URL(normalizedValue);
    const tokenInQuery = parsedUrl.searchParams.get("sessionToken");
    if (tokenInQuery) {
      return tokenInQuery;
    }
  } catch (_error) {
    // Not a URL, treat the raw value itself as token.
  }

  return normalizedValue;
};
