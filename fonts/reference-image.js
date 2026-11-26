'use strict';

let referenceImage = null, imageGesture = null, imageLoadVersion = 0;
const imageWindow = $('#referenceImage'), imageViewport = $('#referenceImageViewport'), imageElement = $('#referenceImageContent');
function referenceImageBounds() {
  return { width: stage.clientWidth, height: stage.clientHeight };
}
function clampReferenceWindow() {
  if (!referenceImage) return;
  const b = referenceImageBounds(), r = referenceImage;
  r.width = clampN(r.width, Math.min(210, b.width), b.width);
  r.height = clampN(r.height, Math.min(150, b.height), b.height);
  r.left = clampN(r.left, 0, Math.max(0, b.width - r.width));
  r.top = clampN(r.top, 0, Math.max(0, b.height - r.height));
}
function renderReferenceImage() {
  const r = referenceImage, button = $('[data-act=referenceimage]');
  button.classList.toggle('active', !!r && r.visible);
  button.title = r ? 'Afficher l’image de référence (temporaire)' : 'Choisir une image locale (temporaire, non exportée)';
  imageWindow.hidden = !r || !r.visible;
  if (!r) return;
  clampReferenceWindow();
  Object.assign(imageWindow.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  $('#referenceImageName').textContent = r.name;
  imageElement.src = r.url;
  imageElement.alt = r.name;
  const w = imageViewport.clientWidth, h = imageViewport.clientHeight;
  const scale = Math.min(w / r.naturalWidth, h / r.naturalHeight) * r.zoom;
  const x = (w - r.naturalWidth * scale) / 2 + r.x, y = (h - r.naturalHeight * scale) / 2 + r.y;
  Object.assign(imageElement.style, { width: r.naturalWidth + 'px', height: r.naturalHeight + 'px', transform: `translate(${x}px,${y}px) scale(${scale})` });
  $('#referenceImageZoom').textContent = Math.round(r.zoom * 100) + '%';
}
function removeReferenceImage() {
  imageLoadVersion++;
  if (referenceImage) URL.revokeObjectURL(referenceImage.url);
  referenceImage = null; imageGesture = null;
  imageElement.removeAttribute('src'); imageWindow.hidden = true;
  renderReferenceImage();
}
function referenceImageAction(action) {
  if (action === 'open') {
    if (referenceImage) { referenceImage.visible = true; renderReferenceImage(); }
    else $('#referenceImageInput').click();
    return;
  }
  if (action === 'replace') { $('#referenceImageInput').click(); return; }
  if (action === 'delete') { removeReferenceImage(); return; }
  if (!referenceImage) return;
  if (action === 'hide') referenceImage.visible = false;
  if (action === 'fit') { referenceImage.zoom = 1; referenceImage.x = 0; referenceImage.y = 0; }
  if (action === 'zoomin' || action === 'zoomout') zoomReferenceImage(action === 'zoomin' ? 1.2 : 1 / 1.2);
  renderReferenceImage();
}
function zoomReferenceImage(factor, point) {
  const r = referenceImage; if (!r) return;
  const next = clampN(r.zoom * factor, 0.1, 20), ratio = next / r.zoom;
  if (point) {
    const x = point.x - imageViewport.clientWidth / 2, y = point.y - imageViewport.clientHeight / 2;
    r.x = x - (x - r.x) * ratio; r.y = y - (y - r.y) * ratio;
  } else { r.x *= ratio; r.y *= ratio; }
  r.zoom = next; renderReferenceImage();
}
$('#referenceImageInput').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const version = ++imageLoadVersion;
  if (!/^image\/(?:png|jpeg|webp|gif|bmp|avif)$/i.test(file.type)) return toast('Format d’image non pris en charge : utilisez PNG, JPEG, WebP, GIF, BMP ou AVIF.');
  const url = URL.createObjectURL(file), image = new Image();
  image.src = url;
  try { await image.decode(); }
  catch (error) { URL.revokeObjectURL(url); if (version === imageLoadVersion) toast('Image illisible : ' + error.message); return; }
  if (version !== imageLoadVersion) { URL.revokeObjectURL(url); return; }
  if (!image.naturalWidth || !image.naturalHeight) { URL.revokeObjectURL(url); toast('Image invalide : dimensions absentes.'); return; }
  if (referenceImage) URL.revokeObjectURL(referenceImage.url);
  const b = referenceImageBounds(), width = Math.min(340, b.width), height = Math.min(280, b.height);
  referenceImage = { url, name: file.name, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    width, height, left: Math.max(0, b.width - width - 12), top: 12, visible: true, zoom: 1, x: 0, y: 0 };
  renderReferenceImage();
});
imageWindow.addEventListener('click', e => {
  const b = e.target.closest('[data-image-act]'); if (b) referenceImageAction(b.dataset.imageAct);
});
imageWindow.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); referenceImageAction('hide'); e.target.blur(); }
});
imageWindow.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !referenceImage) return;
  if (e.target.closest('[data-image-act]')) return;
  const type = e.target.closest('#referenceImageResize') ? 'resize' : e.target.closest('#referenceImageHeader') ? 'move' : e.target.closest('#referenceImageViewport') ? 'pan' : null;
  if (!type) return;
  e.preventDefault();
  imageGesture = { type, id: e.pointerId, x: e.clientX, y: e.clientY, state: { ...referenceImage } };
  imageWindow.setPointerCapture(e.pointerId);
});
imageWindow.addEventListener('pointermove', e => {
  if (!imageGesture || !referenceImage || e.pointerId !== imageGesture.id) return;
  const { type, state } = imageGesture, dx = e.clientX - imageGesture.x, dy = e.clientY - imageGesture.y, r = referenceImage;
  if (type === 'move') { r.left = state.left + dx; r.top = state.top + dy; }
  if (type === 'pan') { r.x = state.x + dx; r.y = state.y + dy; }
  if (type === 'resize') {
    const b = referenceImageBounds();
    r.width = clampN(state.width + dx, Math.min(210, b.width), Math.max(Math.min(210, b.width), b.width - r.left));
    r.height = clampN(state.height + dy, Math.min(150, b.height), Math.max(Math.min(150, b.height), b.height - r.top));
  }
  renderReferenceImage();
});
const finishImageGesture = e => { if (imageGesture?.id === e.pointerId) imageGesture = null; };
imageWindow.addEventListener('pointerup', finishImageGesture);
imageWindow.addEventListener('pointercancel', finishImageGesture);
imageWindow.addEventListener('lostpointercapture', finishImageGesture);
imageViewport.addEventListener('wheel', e => {
  e.preventDefault(); e.stopPropagation();
  const rect = imageViewport.getBoundingClientRect();
  zoomReferenceImage(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - rect.left, y: e.clientY - rect.top });
}, { passive: false });
$('#referenceImageResize').addEventListener('keydown', e => {
  if (!referenceImage || !e.key.startsWith('Arrow')) return;
  e.preventDefault(); e.stopPropagation();
  const step = e.shiftKey ? 20 : 5;
  if (e.key === 'ArrowLeft') referenceImage.width -= step;
  if (e.key === 'ArrowRight') referenceImage.width += step;
  if (e.key === 'ArrowUp') referenceImage.height -= step;
  if (e.key === 'ArrowDown') referenceImage.height += step;
  renderReferenceImage();
});
new ResizeObserver(() => renderReferenceImage()).observe(stage);
window.addEventListener('pagehide', removeReferenceImage);
