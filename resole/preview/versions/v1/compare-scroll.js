(() => {
  if (window.parent === window || new URLSearchParams(location.search).get('compare') !== 'scroll') return;
  let applying = false;
  let releaseTimer;
  let frame;
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.type !== 'resole-compare-position') return;
    const ratio = event.data.ratio;
    if (!Number.isFinite(ratio)) return;
    applying = true;
    clearTimeout(releaseTimer);
    const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({top: Math.min(1, Math.max(0, ratio)) * maximum, behavior: 'instant'});
    releaseTimer = setTimeout(() => { applying = false; }, 100);
  });
  for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener(name, () => {
      clearTimeout(releaseTimer);
      applying = false;
    }, {passive: true});
  }
  window.addEventListener('scroll', () => {
    if (applying || frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (applying) return;
      const maximum = document.documentElement.scrollHeight - window.innerHeight;
      window.parent.postMessage({type: 'resole-compare-scroll', ratio: maximum > 0 ? window.scrollY / maximum : 0}, '*');
    });
  }, {passive: true});
})();
