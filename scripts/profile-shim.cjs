/** Allows tsx CLI scripts to import modules guarded by `server-only`. */
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'server-only' || /[/\\]server-only(?:[/\\]index\.js)?$/.test(String(request))) {
    return {};
  }
  if (request === 'next-intl/server' || /[/\\]next-intl[/\\]server(?:\.js|\.cjs)?$/.test(String(request))) {
    const locale = process.env.PF_SCRIPT_LOCALE ?? 'he-IL';
    return {
      getLocale: async () => locale,
      getMessages: async () => ({}),
      getTranslations: async () => (key) => key,
      setRequestLocale: () => {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
