
/* AutoStyle Firebase Cloud Messaging service worker placeholder.
   For real phone home-screen push notifications, add Firebase Messaging config and VAPID key. */
self.addEventListener("push", function(event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || "AutoStyle";
  const options = {
    body: data.body || data.text || "Новое уведомление",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: data.url || "/"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const url = event.notification.data || "/";
  event.waitUntil(clients.openWindow(url));
});
