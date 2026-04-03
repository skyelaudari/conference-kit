// Google OAuth via Google Identity Services (client-side only)
const CLIENT_ID = '177526131011-1t19njd43f6h3ahe30d7jdcrltcsrvkn.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly';

let tokenClient = null;
let accessToken = null;
let userInfo = null;
let onAuthChange = null; // callback when auth state changes

// Load the Google Identity Services library
function loadGIS() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load Google sign-in'));
    document.head.appendChild(s);
  });
}

export async function initAuth(onChange) {
  onAuthChange = onChange;

  // Restore token from sessionStorage
  const stored = sessionStorage.getItem('ck_token');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.expiry > Date.now()) {
        accessToken = parsed.token;
        userInfo = parsed.user;
      } else {
        sessionStorage.removeItem('ck_token');
      }
    } catch (_) {}
  }
}

export async function signIn() {
  await loadGIS();

  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        accessToken = response.access_token;
        const expiresIn = response.expires_in || 3600;

        // Fetch user info for display
        fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then(r => r.json())
          .then(info => {
            userInfo = { name: info.name, email: info.email, picture: info.picture };
            // Store in sessionStorage (survives page refresh, cleared on tab close)
            sessionStorage.setItem('ck_token', JSON.stringify({
              token: accessToken,
              user: userInfo,
              expiry: Date.now() + expiresIn * 1000,
            }));
            if (onAuthChange) onAuthChange();
            resolve();
          })
          .catch(() => {
            // Token works even without user info
            sessionStorage.setItem('ck_token', JSON.stringify({
              token: accessToken,
              user: null,
              expiry: Date.now() + expiresIn * 1000,
            }));
            if (onAuthChange) onAuthChange();
            resolve();
          });
      },
    });

    tokenClient.requestAccessToken();
  });
}

export function signOut() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  userInfo = null;
  sessionStorage.removeItem('ck_token');
  if (onAuthChange) onAuthChange();
}

export function getAccessToken() {
  return accessToken;
}

export function getUser() {
  return userInfo;
}

export function isSignedIn() {
  return !!accessToken;
}
