const USER_STORAGE_KEY = "att_user";
const TOKEN_STORAGE_KEY = "att_token";

export const getStoredUser = () => {
  try {
    const rawUser = localStorage.getItem(USER_STORAGE_KEY);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (_error) {
    return null;
  }
};

export const setStoredUser = (user) => {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
};

export const clearStoredUser = () => {
  localStorage.removeItem(USER_STORAGE_KEY);
};

/**
 * JWT Token management
 */
export const getStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (_error) {
    return null;
  }
};

export const setStoredToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
};

export const clearStoredToken = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
};

/**
 * Clear all auth data
 */
export const clearAllAuth = () => {
  clearStoredUser();
  clearStoredToken();
};
