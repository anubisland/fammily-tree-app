/* ============================================================
   Service worker — offline support WITHOUT staleness.

   The app loads its logic files with a `?t=<timestamp>` cache-buster so fixes
   reach everyone instantly. A naive "cache-first" worker would undo that and
   bring back the exact stale-code problem we just escaped. So this worker is
   strictly NETWORK-FIRST: when online it always serves fresh bytes and quietly
   refreshes its cache; it only falls back to the cache when the network fails
   (offline). Cached copies are stored under a query-stripped key so a request
   for app.js?t=123 can still be answered offline by the last app.js we saw.
   ============================================================ */
'use strict';

var CACHE = 'family-tree-v18';
// The shell we want available offline. Same-origin, no cache-buster here.
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './kinship.js',
  './app.js',
  './cloud.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Normalise a request URL to a stable cache key: same-origin only, query
// (?t=…/?v=…) removed so the buster does not fragment the cache.
function keyFor(request){
  var url = new URL(request.url);
  url.search = '';
  return url.href;
}

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ return k === CACHE ? null : caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;                 // never touch writes
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;  // let Firebase/fonts hit network directly

  e.respondWith(
    fetch(req).then(function(res){
      // Refresh the cache with a query-stripped copy for offline use. Only a
      // full 200 is cacheable — cache.put rejects on a 206 partial (res.ok is
      // still true for 206), and a quota-full device rejects too, so swallow
      // those so they don't become unhandled rejections. Foreground still gets
      // the live response either way; we just skip refreshing the offline copy.
      if(res && res.status === 200){
        var copy = res.clone();
        caches.open(CACHE)
          .then(function(c){ return c.put(keyFor(req), copy); })
          .catch(function(){ /* quota/partial: keep last good copy */ });
      }
      return res;
    }).catch(function(){
      // Offline: serve the last good copy (ignoring the cache-buster query).
      return caches.open(CACHE).then(function(c){
        return c.match(keyFor(req)).then(function(hit){
          if(hit) return hit;
          // Only fall back to the app shell for real navigations — returning
          // index.html for an uncached script/image would hand the browser HTML
          // as a 200 and produce a baffling "Unexpected token <". Everything
          // else gets an honest offline error instead.
          if(req.mode === 'navigate') return c.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline and not cached' });
        });
      });
    })
  );
});
