const CACHE_NAME='meow-work-pwa-v181';
const STATIC_ASSETS=['./index.html','./privacy.html','./terms.html','./support.html','./manifest.webmanifest?v=181','./assets/welcome-brand-v112.webp','./assets/mobile-hero-clean-v75.png','./assets/mobile-rest-card-v75.webp','./assets/meow-assistant-pro-v169.webp?v=169','./workcat-home-v12.png','./app-icon-v178-180.png?v=181','./app-icon-v178-192.png?v=181','./app-icon-v178-512.png?v=181','./splash-v181.jpg?v=181'];
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(STATIC_ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('meow-work-pwa-')&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Never cache OAuth, account, entitlement, billing or work-data API responses.
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    const legal=/\/(?:privacy|terms|support)\.html$/.test(url.pathname);
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(async response=>{
      if(response.ok){
        const cache=await caches.open(CACHE_NAME);
        if(legal)await cache.put(event.request,response.clone());
        else await cache.put('./index.html',response.clone());
      }
      return response;
    }).catch(()=>legal?caches.match(event.request):caches.match('./index.html')));return;
  }
  if(!/\.(?:png|webp|jpg|jpeg|svg|webmanifest|css|js)$/.test(url.pathname))return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone()));return response;
  })));
});
