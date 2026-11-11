// Global loading state: skeleton while a segment loads.
//
// Round 5 skeleton fix: this used to be a bare skeleton with no escape
// hatch — if the awaited server component never resolved (hung DB query,
// hung internal API self-fetch, killed stream), the skeleton stayed on
// screen forever with no error and no retry.
//
// The escape hatch here is a plain inline <script>, NOT a React
// "use client" timer and NOT a Retry button — both were tried and PROVEN
// NOT to work in production:
//  * A "use client" timer never fires: React does not hydrate the nodes
//    inside a still-pending Suspense fallback (verified live: after 20 s
//    the skeleton nodes had no __reactFiber$ props while the rest of the
//    page had hydrated), so a useEffect timer inside loading.tsx can
//    never run while the page is stuck.
//  * A Retry button/link inside the fallback is unclickable: React's
//    document-level capture click listener stops propagation after the
//    document for events targeting the unhydrated fallback (verified live
//    via CDP: a click dispatched on the button reached window/document
//    capture listeners and then nothing — not the button, not its
//    parents, not document bubble — while the same dispatch on a control
//    button propagated fully). A real user tap is swallowed the same way.
// A raw inline script needs no hydration and no event: after 15 s it
// checks whether the fallback is still in the DOM (it is gone once the
// page resolves, so a healthy load is untouched) and, only if still
// stuck, shows a "trying again" card and reloads the page. Reloads are
// capped at 3 within 5 minutes (sessionStorage) so a persistently-down
// backend does not loop forever; after the cap it shows a static message
// telling the user to pull-to-refresh or reopen the tab (browser-chrome
// actions, which still work). 15 s exceeds the 8 s server-side
// fetch/DB timeouts in server-data / dashboard / orders-check, so a page
// that is about to fail into error.tsx is not pre-empted. CSP already
// allows inline scripts (script-src 'self' 'unsafe-inline', required by
// Next's own flight scripts — see middleware.ts).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading">
      <div id="r5-loading-fallback">
        <div className="skeleton mb-6 h-7 w-56" />
        <div className="skeleton mb-4 h-4 w-80 max-w-full" />
        <div className="card p-5">
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var DELAY=15000,MAX_RELOADS=3,WINDOW_MS=300000,KEY='r5-stuck-reloads';setTimeout(function(){var el=document.getElementById('r5-loading-fallback');if(!el||!document.body.contains(el))return;var state=null;try{state=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch(e){state=null;}var now=Date.now();if(!state||now-state.at>WINDOW_MS)state={count:0,at:now};if(state.count<MAX_RELOADS){state.count++;state.at=now;try{sessionStorage.setItem(KEY,JSON.stringify(state));}catch(e){}el.innerHTML='<div class="card p-5 sm:p-6"><h1 class="text-lg font-medium text-[var(--text)]">This is taking longer than usual</h1><p class="mt-1 text-sm text-[var(--muted)]">The page hasn\\u2019t loaded yet \\u2014 trying again automatically\\u2026 Your payments and orders are safe.</p></div>';setTimeout(function(){window.location.reload();},2500);}else{el.innerHTML='<div class="card p-5 sm:p-6"><h1 class="text-lg font-medium text-[var(--text)]">Still not loading</h1><p class="mt-1 text-sm text-[var(--muted)]">The page hasn\\u2019t loaded after a few tries. Your connection may be down, or the server may be stuck. Your payments and orders are safe. Please pull down to refresh, or close and reopen this tab.</p></div>';}},DELAY);})();`,
        }}
      />
    </div>
  );
}
