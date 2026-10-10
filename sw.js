"use strict";

const VERSION = "56fa4ff5814d";
const FILES = {
  ".nojekyll": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "fonts/Jua.woff2": "81c487d37033de2dac312001ffdaa09c830d0cce557921665b6b5a5cb285c731",
  "fonts/OFL.txt": "44a7c6e4c5572392ae122d3b1d8c6ba6fd640a7797e675384585d947f2773e3c",
  "icons/icon-192.png": "3fd3433d0a4b75a0c11df0f7996ae6628e75a69771e6f66f80ebf7f263a8880f",
  "icons/icon-512.png": "913a52b00c3b180bc8f7580aecbd02e5e43a10b147e42ff6f634f355e46414ca",
  "icons/icon-maskable-512.png": "63cd6b60ee3ea4f3811a64e521ced02ee185c5f92baab8e87868e7c7d5919501",
  "index.html": "1417c1d6f3c8b1e58b093b59f72933a80577d355bdd7eb1effc7916565d5e636",
  "manifest.webmanifest": "253f33518e90f0debd78160f8cfaa625595200d0f2c61c3daf8e068ee44e8df3"
};
const CACHE_NAME = "kongkong-" + VERSION;
const fileURL = name => new URL(name, self.registration.scope).href;
let firstInstall = false;

self.addEventListener("install", event => {
  firstInstall = !self.registration.active;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // Sequential writes ensure no unfinished fetch can recreate a failed cache.
      for (const [name, expected] of Object.entries(FILES)) {
        const url = fileURL(name);
        const response = await fetch(url, {cache: "reload"});
        if (!response.ok || response.type === "opaque" || response.url !== url) {
          throw new Error("파일 응답 실패: " + name);
        }
        const digest = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
        const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
        if (actual !== expected) throw new Error("SHA-256 불일치: " + name);
        await cache.put(url, response);
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("kongkong-") && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    if (firstInstall) await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(event.request.mode === "navigate" ? fileURL("index.html") : event.request);
    return response || fetch(event.request);
  })());
});

self.addEventListener("message", event => {
  const reply = data => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(data);
  };
  if (event.data === "status") {
    event.waitUntil((async () => {
      try {
        let ready = await caches.has(CACHE_NAME);
        if (ready) {
          const cache = await caches.open(CACHE_NAME);
          for (const name of Object.keys(FILES)) {
            if (!await cache.match(fileURL(name))) { ready = false; break; }
          }
        }
        reply({ready, version: VERSION});
      } catch (_) {
        reply({ready: false, version: VERSION});
      }
    })());
  } else if (event.data === "apply") {
    event.waitUntil((async () => {
      try {
        // A waiting worker controls no windows yet, so include uncontrolled
        // clients and count only windows inside this registration's scope.
        const windows = (await self.clients.matchAll({type: "window", includeUncontrolled: true}))
          .filter(client => client.url.startsWith(self.registration.scope));
        if (windows.length !== 1) {
          reply({applied: false, reason: "window-count", windows: windows.length});
          return;
        }
        await self.skipWaiting();
        reply({applied: true, version: VERSION});
      } catch (_) {
        reply({applied: false, reason: "apply-failed"});
      }
    })());
  }
});
