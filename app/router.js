// Simple hash-based router
const routes = {};
let currentCleanup = null;

export function route(pattern, handler) {
  routes[pattern] = handler;
}

export function navigate(hash) {
  window.location.hash = hash;
}

function runCleanup() {
  if (typeof currentCleanup === 'function') currentCleanup();
  currentCleanup = null;
}

function runHandler(handler, params, app) {
  runCleanup();
  const result = handler(params, app);
  // Only store cleanup if it's a sync function (not a Promise)
  if (typeof result === 'function') currentCleanup = result;
}

function match() {
  const hash = window.location.hash.slice(1) || '/';
  const app = document.getElementById('app');

  // Try exact match first
  if (routes[hash]) {
    runHandler(routes[hash], {}, app);
    return;
  }

  // Try parameterized routes
  for (const [pattern, handler] of Object.entries(routes)) {
    const paramNames = [];
    const regex = pattern.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const m = hash.match(new RegExp(`^${regex}$`));
    if (m) {
      const params = {};
      paramNames.forEach((name, i) => params[name] = decodeURIComponent(m[i + 1]));
      runHandler(handler, params, app);
      return;
    }
  }

  // 404 fallback
  runCleanup();
  navigate('/');
}

export function start() {
  window.addEventListener('hashchange', match);
  match();
}
