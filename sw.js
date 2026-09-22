/* Cache only the static app shell. Never cache authentication or work-data API responses. */
const CACHE_NAME='meow-work-pwa-v112';
const ROOT=new URL('./',self.location.href);
const SHELL=['./index.html','./manifest.webmanifest?v=112','./assets/onboarding.css?v=112','./assets/onboarding-brand-cat.webp?v=112','./assets/mobile-hero-clean-v75.png','./assets/mobile-rest-card-v75.webp','./workcat-home-v12.png'];
const SHELL_URL=new URL('./index.html',ROOT).href;
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(SHELL.map(path=>new Request(new URL(path,ROOT).href,{cache:'reload'})));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('meow-work-pwa-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
function isStaticRequest(request){
 const url=new URL(request.url);
 if(request.method!=='GET'||request.headers.has('Authorization')||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return false;
 const relative=url.pathname.slice(ROOT.pathname.length);
 return /^assets\/[^/]+\.(css|webp|png|jpg|jpeg|svg)$/.test(relative)||['manifest.webmanifest','workcat-home-v12.png','app-icon-512.jpg'].includes(relative);
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||request.headers.has('Authorization')||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;
 if(request.mode==='navigate'&&(url.pathname===ROOT.pathname||url.pathname===new URL('index.html',ROOT).pathname)){
  event.respondWith((async()=>{
   try{
    const response=await fetch(request,{cache:'no-store'});
    // Store only canonical static HTML, never OAuth callback parameters or tokens.
    if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(SHELL_URL,response.clone())}
    return response;
   }catch(error){const cache=await caches.open(CACHE_NAME);const fallback=await cache.match(SHELL_URL);if(fallback)return fallback;throw error}
  })());return;
 }
 if(!isStaticRequest(request))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME),cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
 })());
});
