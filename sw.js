const CACHE_NAME='meow-work-pwa-v113';
const STATIC_ASSETS=['./index.html','./manifest.webmanifest?v=113','./assets/welcome-brand-v112.webp','./assets/mobile-hero-clean-v75.png','./assets/mobile-rest-card-v75.webp','./workcat-home-v12.png'];
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('meow-work-pwa-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache OAuth, account, entitlement, billing or work-data API responses.
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put('./index.html',response.clone())}
      return response;
    }).catch(()=>caches.match('./index.html')));return;
  }
  if(!/\.(?:png|webp|jpg|jpeg|svg|webmanifest|css|js)$/.test(url.pathname))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone()));return response;
  })));
});
