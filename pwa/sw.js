// Service worker d'Alter.
//
// Il ne met en cache QUE l'interface (HTML, CSS, JS, icônes). Jamais les réponses du
// serveur, le portefeuille, le journal ni la conversation : tout appel vers Supabase
// ou un autre domaine passe directement au réseau, sans copie locale.
// Il affiche aussi la notification du lundi, qui arrive sans contenu.

const VERSION = "alter-v1";
const INTERFACE = [
  "./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "icons/favicon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(INTERFACE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const cle of await caches.keys()) if (cle !== VERSION) await caches.delete(cle);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // réseau direct, aucune copie
  // config.js : toujours le réseau d'abord (il change au déploiement), copie de secours.
  if (url.pathname.endsWith("/config.js")) {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copie = r.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); }
      return r;
    }).catch(() => caches.match(req).then((r) => r || new Response("", { headers: { "Content-Type": "text/javascript" } }))));
    return;
  }
  // Interface : copie locale d'abord, mise à jour en arrière-plan.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((enCache) => {
    const reseau = fetch(req).then((r) => {
      if (r.ok && INTERFACE.some((f) => url.pathname.endsWith(f.replace("./", "/")))) {
        const copie = r.clone(); caches.open(VERSION).then((c) => c.put(req, copie));
      }
      return r;
    });
    return enCache || reseau;
  }));
});

self.addEventListener("push", (e) => {
  e.waitUntil(self.registration.showNotification("Alter", {
    body: "Ta revue du lundi est prête.",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "alter-revue",
    renotify: true,
    data: { url: "./#revue" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const cible = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const f of fenetres) {
      if (f.url.startsWith(self.registration.scope)) { await f.focus(); return f.navigate(cible); }
    }
    return self.clients.openWindow(cible);
  })());
});
