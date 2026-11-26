window.addEventListener('contextmenu', (event) => {
  if (!event.isTrusted || event.button !== 2) return;
  const image = event.composedPath().find(node => node instanceof HTMLImageElement);
  if (!image?.complete || !image.naturalWidth) return;

  // Keep Chromium's image hit-test by leaving the default context-menu action enabled.
  event.stopImmediatePropagation();
}, true);
