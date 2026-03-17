// ═════════════════════════════════════════════════════════
//  Fisheye Calibrator - Frontend Application
// ═════════════════════════════════════════════════════════

// ══ State ════════════════════════════════════════════════
let images = [];
let curIdx = -1;
let corners = [];       // [{x,y}, ...] local copy
let imgW = 1, imgH = 1;
let zoom = 1.0;
let mode = 'view';      // view | add | del | num
let dragging = -1;
let showLabels = true;
let calResult = null;
let reportB64 = null;

// num-mode state
let numTarget = -1;     // index of corner being edited

// pan state
let isPanning = false;
let panX = 0, panY = 0;
let panStartX = 0, panStartY = 0;
let isSpacePressed = false;

const imgEl = document.getElementById('imgEl');
const overlay = document.getElementById('overlay');
const ov = overlay.getContext('2d');
const wrap = document.getElementById('wrap');
const cc = document.getElementById('cc');

// ══ Directory Load ═════════════════════════════════════
async function pickImageDirectory() {
  const r = await fetch('/api/pick_dir', { method: 'POST' });
  const d = await r.json();
  if (!d.ok) {
    if (d.error !== '未选择目录') toast(d.error || '目录选择失败', 'warn');
    return;
  }
  const input = document.getElementById('dirPath');
  if (input) input.value = d.dir_path;
  await loadImageDirectory(d.dir_path);
}

async function loadImageDirectory(forcedPath = '') {
  const input = document.getElementById('dirPath');
  const dirPath = (forcedPath || input?.value || '').trim();
  if (!dirPath) return toast('请输入图片目录路径', 'warn');

  addLog(`加载目录: ${dirPath}`, 'info');
  const r = await fetch('/api/load_dir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir_path: dirPath })
  });
  const d = await r.json();
  if (d.ok) {
    if (Number.isFinite(d.cols)) document.getElementById('cbc').value = d.cols;
    if (Number.isFinite(d.rows)) document.getElementById('cbr').value = d.rows;
    if (Number.isFinite(d.square_size)) document.getElementById('sqsz').value = d.square_size;

    const msg = d.restored > 0
      ? `已加载 ${d.added} 张，恢复角点 ${d.restored} 张`
      : `已加载 ${d.added} 张`;
    toast(msg, 'ok');

    await refreshList();
    if (images.length) await selectImage(0);
  } else {
    toast(d.error || '目录加载失败', 'err');
  }
}

const dirPathInput = document.getElementById('dirPath');
dirPathInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadImageDirectory();
});

// ══ Image List ═════════════════════════════════════════
async function refreshList() {
  const r = await fetch('/api/images');
  const d = await r.json();
  images = d.images;
  renderList();
  updateUndistortSelector();
  updateHeader();
  updateCalibBtn();
  updateRightPanel();
}

function renderList() {
  const el = document.getElementById('ilist');
  if (!images.length) {
    el.innerHTML = '<div style="text-align:center;padding:28px 12px;color:var(--tx3);font-size:11px">输入目录并加载图片</div>';
    return;
  }
  el.innerHTML = images.map((im, i) => {
    const bc = { full: 'bok', partial: 'bwarn', failed: 'berr', pending: 'bpend' }[im.status] || 'bpend';
    const bi = { full: '✓', partial: '△', failed: '✗', pending: '?' }[im.status] || '?';
    const src = im.thumb_b64 ? `data:image/jpeg;base64,${im.thumb_b64}` : '';
    return `
      <div class="iitem ${i === curIdx ? 'active' : ''}" onclick="selectImage(${i})">
        ${src ? `<img class="ithumb" src="${src}">` : '<div class="ithumb"></div>'}
        <div class="iinfo">
          <div class="iname" title="${im.name}">${im.name}</div>
          <div class="imeta">${im.w}×${im.h} · ${im.n_corners}/${im.expected}pt</div>
        </div>
        <div class="ibadge ${bc}">${bi}</div>
      </div>
    `;
  }).join('');
  document.getElementById('btDA').disabled = images.length === 0;
}

function updateHeader() {
  const ok = images.filter(i => i.status === 'full').length;
  document.getElementById('hImgCnt').textContent = `${images.length} 张图片`;
  document.getElementById('hOkCnt').textContent = `${ok} 有效`;
  document.getElementById('hOkCnt').classList.toggle('on', ok > 0);
}

function updateCalibBtn() {
  const ok = images.filter(i => i.status === 'full').length;
  document.getElementById('btCal').disabled = ok < 3;
}

function updateRightPanel() {
  const ok = images.filter(i => i.status === 'full').length;
  document.getElementById('pUs').textContent = `${ok}/${images.length}`;
}

// ══ Select Image ═══════════════════════════════════════
async function selectImage(idx) {
  curIdx = idx;
  closeIdxPop();
  const r = await fetch(`/api/image/${idx}`);
  const d = await r.json();
  if (!d.ok) {
    toast(d.error, 'err');
    return;
  }
  imgW = d.w;
  imgH = d.h;
  corners = d.corners.map(p => ({ x: p[0], y: p[1] }));
  document.getElementById('emptyS').style.display = 'none';
  wrap.style.display = 'inline-block';
  imgEl.src = `data:image/jpeg;base64,${d.img_b64}`;
  imgEl.onload = () => {
    fitZoom();
    redraw();
  };
  document.getElementById('sn').textContent = images[idx].name;
  document.getElementById('ss').textContent = `${d.w}×${d.h}`;
  document.getElementById('btDet').disabled = false;
  document.getElementById('btClr').disabled = false;
  document.getElementById('btFlip').disabled = false;
  const udSel = document.getElementById('udSel');
  if (udSel && idx >= 0) udSel.value = String(idx);
  updateCornerUI();
  renderList();
}

// ══ Zoom ═══════════════════════════════════════════════
function fitZoom() {
  const cc = document.getElementById('cc');
  const pw = cc.clientWidth - 28, ph = cc.clientHeight - 28;
  if (imgW && imgH) {
    zoom = Math.min(1.5, Math.min(pw / imgW, ph / imgH));
    applyZoom();
  }
}

function changeZoom(d) {
  zoom = Math.min(4, Math.max(0.1, zoom + d));
  applyZoom();
}

function changeZoomAt(d, clientX, clientY) {
  const oldZoom = zoom;
  const nextZoom = Math.min(4, Math.max(0.1, zoom + d));
  if (nextZoom === oldZoom) return;

  const rect = overlay.getBoundingClientRect();
  const baseLeft = rect.left - panX;
  const baseTop = rect.top - panY;

  // Image-space point under cursor (clamped)
  const ix = Math.min(imgW, Math.max(0, (clientX - rect.left) / oldZoom));
  const iy = Math.min(imgH, Math.max(0, (clientY - rect.top) / oldZoom));

  zoom = nextZoom;
  applyZoom({ resetPan: false, redrawNow: false });

  // Keep the same image point under the cursor after zoom
  panX = clientX - baseLeft - ix * zoom;
  panY = clientY - baseTop - iy * zoom;
  applyPan();
  redraw();
}

function applyZoom({ resetPan = true, redrawNow = true } = {}) {
  document.getElementById('zlbl').textContent = `${Math.round(zoom * 100)}%`;
  imgEl.style.width = (imgW * zoom) + 'px';
  imgEl.style.height = (imgH * zoom) + 'px';
  overlay.width = imgW * zoom;
  overlay.height = imgH * zoom;
  overlay.style.width = (imgW * zoom) + 'px';
  overlay.style.height = (imgH * zoom) + 'px';
  if (resetPan) {
    panX = 0;
    panY = 0;
  }
  applyPan();
  if (redrawNow) redraw();
}

function applyPan() {
  imgEl.style.transform = `translate(${panX}px, ${panY}px)`;
  overlay.style.transform = `translate(${panX}px, ${panY}px)`;
}

cc.addEventListener('wheel', e => {
  if (wrap.style.display === 'none') return;
  e.preventDefault();
  const d = e.deltaY < 0 ? 0.1 : -0.1;

  // Prefer zooming around the cursor when it's over the image; otherwise zoom around view center.
  const r = overlay.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (inside) {
    changeZoomAt(d, e.clientX, e.clientY);
  } else {
    const ccr = cc.getBoundingClientRect();
    changeZoomAt(d, ccr.left + ccr.width / 2, ccr.top + ccr.height / 2);
  }
}, { passive: false });

// ══ Draw ═══════════════════════════════════════════════
function redraw() {
  ov.clearRect(0, 0, overlay.width, overlay.height);
  if (!corners.length) return;

  const cols_n = parseInt(document.getElementById('cbc').value);
  const rows_n = parseInt(document.getElementById('cbr').value);
  const n = corners.length, exp = cols_n * rows_n;
  // Fixed dot size - doesn't scale with zoom
  const DOT = 6;
  const LINE_WIDTH = 1.5;

  // Grid lines when complete
  if (n === exp) {
    ov.strokeStyle = 'rgba(0,210,170,.5)';
    ov.lineWidth = LINE_WIDTH;
    for (let row = 0; row < rows_n; row++) {
      ov.beginPath();
      for (let col = 0; col < cols_n; col++) {
        const { x, y } = corners[row * cols_n + col];
        col === 0 ? ov.moveTo(x * zoom, y * zoom) : ov.lineTo(x * zoom, y * zoom);
      }
      ov.stroke();
    }
    for (let col = 0; col < cols_n; col++) {
      ov.beginPath();
      for (let row = 0; row < rows_n; row++) {
        const { x, y } = corners[row * cols_n + col];
        row === 0 ? ov.moveTo(x * zoom, y * zoom) : ov.lineTo(x * zoom, y * zoom);
      }
      ov.stroke();
    }
  }

  // Draw all detected corners (even if incomplete)
  corners.forEach(({ x, y }, i) => {
    const px = x * zoom, py = y * zoom;
    const t = i / Math.max(1, n - 1);
    const rc = Math.round(255 * Math.max(0, 1 - 2 * t));
    const gc = Math.round(255 * Math.min(1, 2 * t));

    // Shadow
    ov.beginPath();
    ov.arc(px, py, DOT + 2.5, 0, Math.PI * 2);
    ov.fillStyle = 'rgba(0,0,0,.55)';
    ov.fill();

    // Dot
    ov.beginPath();
    ov.arc(px, py, DOT, 0, Math.PI * 2);
    ov.fillStyle = `rgb(${rc},${gc},55)`;
    ov.fill();

    // Highlight rings
    if (i === dragging) {
      ov.beginPath();
      ov.arc(px, py, DOT + 5, 0, Math.PI * 2);
      ov.strokeStyle = '#ffcc00';
      ov.lineWidth = 2.5;
      ov.stroke();
    } else if (i === numTarget && mode === 'num') {
      ov.beginPath();
      ov.arc(px, py, DOT + 5, 0, Math.PI * 2);
      ov.strokeStyle = '#7b61ff';
      ov.lineWidth = 2.5;
      ov.stroke();
    } else if (i === 0) {
      ov.beginPath();
      ov.arc(px, py, DOT + 3, 0, Math.PI * 2);
      ov.strokeStyle = 'rgba(0,190,255,.9)';
      ov.lineWidth = 2;
      ov.stroke();
    }

    // White border
    ov.beginPath();
    ov.arc(px, py, DOT, 0, Math.PI * 2);
    ov.strokeStyle = 'rgba(255,255,255,.75)';
    ov.lineWidth = 1.2;
    ov.stroke();

    // Index label
    if (showLabels) {
      const label = String(i);
      const fs = 11;  // Fixed font size
      ov.font = `600 ${fs}px 'JetBrains Mono',monospace`;
      const tw = ov.measureText(label).width;
      const pad = 3, bw = tw + pad * 2 + 2, bh = fs + pad * 2;
      let bx = px + DOT + 2, by = py - DOT - bh;
      if (bx + bw > overlay.width - 4) bx = px - DOT - bw - 2;
      if (by < 2) by = py + DOT + 2;

      ov.fillStyle = (mode === 'num' && i === numTarget)
        ? 'rgba(123,97,255,.92)'
        : 'rgba(10,12,16,.85)';
      ov.beginPath();
      ov.roundRect(bx, by, bw, bh, 4);
      ov.fill();

      ov.strokeStyle = (mode === 'num' && i === numTarget)
        ? 'rgba(180,160,255,.9)'
        : `rgba(${rc + 60 > 255 ? 255 : rc + 60},${gc + 60 > 255 ? 255 : gc + 60},120)`;
      ov.lineWidth = 1;
      ov.beginPath();
      ov.roundRect(bx, by, bw, bh, 4);
      ov.stroke();

      ov.fillStyle = (mode === 'num' && i === numTarget)
        ? '#fff'
        : `rgb(${rc + 60 > 255 ? 255 : rc + 60},${gc + 60 > 255 ? 255 : gc + 60},120)`;
      ov.fillText(label, bx + pad + 1, by + bh - pad - 1);
    }
  });
}

// ══ Mouse Events ═══════════════════════════════════════
// Mouse down for panning (middle button or space+left click)
wrap.addEventListener('mousedown', e => {
  if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
    e.preventDefault();
    isPanning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    wrap.style.cursor = 'grabbing';
  }
});

document.addEventListener('mousemove', e => {
  if (isPanning) {
    e.preventDefault();
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    applyPan();
  }
});

document.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    wrap.style.cursor = isSpacePressed ? 'grab' : (mode === 'view' ? 'default' : 'crosshair');
  }
});

overlay.addEventListener('mousemove', e => {
  if (isPanning) return;  // Don't process corner events while panning
  if (curIdx < 0) return;
  const rect = overlay.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  const ix = px / zoom, iy = py / zoom;
  document.getElementById('sp').textContent = `${Math.round(ix)}, ${Math.round(iy)}`;
  if (mode === 'add') {
    const ccRect = cc.getBoundingClientRect();
    const cx = e.clientX - ccRect.left;
    const cy = e.clientY - ccRect.top;
    const chH = document.getElementById('chH');
    const chV = document.getElementById('chV');
    const chDot = document.getElementById('chDot');
    chH.style.top = (cc.scrollTop + cy) + 'px';
    chV.style.left = (cc.scrollLeft + cx) + 'px';
    chDot.style.left = (cc.scrollLeft + cx) + 'px';
    chDot.style.top = (cc.scrollTop + cy) + 'px';
  }
  if (dragging >= 0) {
    corners[dragging] = { x: ix, y: iy };
    redraw();
    document.getElementById('delhint').classList.toggle('show', py > overlay.height - 52);
  }
});

overlay.addEventListener('mousedown', e => {
  if (curIdx < 0) return;
  // Keep middle-button drag for panning; only left-click edits corners.
  if (e.button !== 0) return;
  e.preventDefault();
  const rect = overlay.getBoundingClientRect();
  const ix = (e.clientX - rect.left) / zoom, iy = (e.clientY - rect.top) / zoom;
  const hitR = 14 / zoom;

  if (mode === 'view') {
    let best = -1, bd = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const dx = corners[i].x - ix, dy = corners[i].y - iy;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < hitR) {
      dragging = best;
      overlay.style.cursor = 'grabbing';
    }
  } else if (mode === 'add') {
    corners.push({ x: ix, y: iy });
    pushCorners();
    redraw();
    updateCornerUI();
  } else if (mode === 'del') {
    let best = -1, bd = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const d = Math.hypot(corners[i].x - ix, corners[i].y - iy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < (7 + 8) / zoom * 2) {
      corners.splice(best, 1);
      pushCorners();
      redraw();
      updateCornerUI();
    }
  } else if (mode === 'num') {
    let best = -1, bd = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const d = Math.hypot(corners[i].x - ix, corners[i].y - iy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < (7 + 10) / zoom * 2) {
      openIdxPop(best, e.clientX, e.clientY);
    }
  }
});

overlay.addEventListener('mouseup', e => {
  if (dragging >= 0) {
    const rect = overlay.getBoundingClientRect();
    const py = e.clientY - rect.top;
    if (py > overlay.height - 52) {
      corners.splice(dragging, 1);
    }
    dragging = -1;
    overlay.style.cursor = 'default';
    document.getElementById('delhint').classList.remove('show');
    pushCorners();
    redraw();
    updateCornerUI();
  }
});

overlay.addEventListener('mouseleave', () => {
  document.getElementById('sp').textContent = '—';
});

// ══ Index Edit Popup ═══════════════════════════════════
function openIdxPop(cornerIdx, clientX, clientY) {
  numTarget = cornerIdx;
  const pop = document.getElementById('idxPop');
  const pt = corners[cornerIdx];
  document.getElementById('popBadge').textContent = cornerIdx;
  document.getElementById('popInfo').innerHTML =
    `当前序号：<b>${cornerIdx}</b> 坐标：<b>${Math.round(pt.x)}, ${Math.round(pt.y)}</b>`;
  const input = document.getElementById('popInput');
  input.max = corners.length - 1;
  input.value = cornerIdx;
  document.getElementById('popHint').textContent =
    `与目标序号的点互换位置（范围 0–${corners.length - 1}）`;

  const pw = 220, ph = 180;
  let left = clientX + 12, top = clientY - 20;
  if (left + pw > window.innerWidth - 8) left = clientX - pw - 12;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (top < 8) top = 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.classList.add('show');
  input.select();
  redraw();
}

function closeIdxPop() {
  document.getElementById('idxPop').classList.remove('show');
  numTarget = -1;
  redraw();
}

function confirmIdx() {
  if (numTarget < 0) return;
  const input = document.getElementById('popInput');
  const newIdx = parseInt(input.value);
  const n = corners.length;
  if (isNaN(newIdx) || newIdx < 0 || newIdx >= n) {
    toast(`序号须在 0–${n - 1} 范围内`, 'warn');
    return;
  }
  if (newIdx === numTarget) {
    closeIdxPop();
    return;
  }
  const tmp = corners[numTarget];
  corners[numTarget] = corners[newIdx];
  corners[newIdx] = tmp;
  toast(`已将序号 ${numTarget} ↔ ${newIdx} 互换`, 'ok');
  pushCorners();
  closeIdxPop();
  redraw();
  updateCornerUI();
}

document.getElementById('popInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmIdx();
  if (e.key === 'Escape') closeIdxPop();
});

// ══ Push Corners ═══════════════════════════════════════
let pushTimer = null;
function pushCorners() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    if (curIdx < 0) return;
    const pts = corners.map(p => [p.x, p.y]);
    await fetch(`/api/corners/${curIdx}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corners: pts })
    });
    await refreshList();
  }, 300);
}

// ══ Mode ═══════════════════════════════════════════════
function setMode(m) {
  if (m !== 'num') closeIdxPop();
  mode = m;
  cc.classList.toggle('crosshair-on', m === 'add');
  ['mV', 'mA', 'mD', 'mN'].forEach(id => {
    document.getElementById(id).classList.remove('on');
  });
  const mp = { view: 'mV', add: 'mA', del: 'mD', num: 'mN' };
  document.getElementById(mp[m]).classList.add('on');
  const cursors = { view: 'default', add: 'crosshair', del: 'not-allowed', num: 'pointer' };
  const cursor = isSpacePressed ? 'grab' : cursors[m];
  overlay.style.cursor = cursor;
  wrap.style.cursor = isSpacePressed ? 'grab' : cursor;
  const hints = {
    view: '移动模式 — 拖拽角点调位置，拖到底部边缘删除',
    add: '添加模式 — 点击图像添加新角点',
    del: '删除模式 — 点击最近角点删除',
    num: '编辑序号 — 点击角点输入新序号，与目标互换'
  };
  document.getElementById('modeHint').textContent = hints[m];
  redraw();
}

// ══ Corner Tools ═══════════════════════════════════════
function toggleLabels() {
  showLabels = !showLabels;
  const b = document.getElementById('btLabel');
  b.classList.toggle('on-blue', showLabels);
  b.textContent = showLabels ? '🏷 序号 ✓' : '🏷 序号';
  redraw();
}

function flipCorners() {
  if (!corners.length) return;
  corners.reverse();
  pushCorners();
  redraw();
  updateCornerUI();
  toast('已翻转角点顺序（0↔末尾）', 'ok');
}

function clearCorners() {
  if (curIdx < 0) return;
  corners = [];
  closeIdxPop();
  pushCorners();
  redraw();
  updateCornerUI();
}

// ══ Detect ═════════════════════════════════════════════
async function detectCurrent() {
  if (curIdx < 0) return;
  addLog('自动检测…', 'info');
  const cols_n = parseInt(document.getElementById('cbc').value);
  const rows_n = parseInt(document.getElementById('cbr').value);
  const r = await fetch(`/api/detect/${curIdx}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cols: cols_n, rows: rows_n })
  });
  const d = await r.json();
  corners = d.corners.map(p => ({ x: p[0], y: p[1] }));
  redraw();
  updateCornerUI();
  await refreshList();
  toast(d.found ? `检测到 ${corners.length} 角点` : '未检测到棋盘', d.found ? 'ok' : 'warn');
}

async function detectAll() {
  const cols_n = parseInt(document.getElementById('cbc').value);
  const rows_n = parseInt(document.getElementById('cbr').value);
  addLog('批量检测…', 'info');
  const r = await fetch('/api/detect_all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cols: cols_n, rows: rows_n })
  });
  const d = await r.json();
  await refreshList();
  if (curIdx >= 0) await selectImage(curIdx);
  toast(`批量检测：${d.ok}/${d.total} 成功`, d.ok > 0 ? 'ok' : 'warn');
}

// Clear all uploaded images
async function clearAllImages() {
  if (!images.length) {
    toast('没有图片可清空', 'warn');
    return;
  }
  if (!confirm(`确定要清空所有 ${images.length} 张图片吗？\n\n此操作不可恢复！`)) {
    return;
  }
  
  // Call backend to clear state
  try {
    await fetch('/api/clear', { method: 'POST' });
  } catch (e) {
    console.error('Failed to clear backend state:', e);
  }
  
  // Reset frontend state
  images = [];
  curIdx = -1;
  corners = [];
  imgW = 1;
  imgH = 1;
  panX = 0;
  panY = 0;
  
  // Hide canvas
  document.getElementById('emptyS').style.display = 'flex';
  wrap.style.display = 'none';
  
  // Reset UI
  document.getElementById('sn').textContent = '—';
  document.getElementById('ss').textContent = '—';
  document.getElementById('sc').textContent = '0';
  document.getElementById('sp').textContent = '—';
  document.getElementById('btDet').disabled = true;
  document.getElementById('btClr').disabled = true;
  document.getElementById('btFlip').disabled = true;
  document.getElementById('btDA').disabled = true;
  document.getElementById('btCal').disabled = true;
  document.getElementById('hImgCnt').textContent = '0 张图片';
  document.getElementById('hOkCnt').textContent = '0 有效';
  document.getElementById('hOkCnt').classList.remove('on');
  document.getElementById('pUs').textContent = '0/0';
  document.getElementById('pSt').textContent = '未选择';
  document.getElementById('pCn').textContent = '—';
  document.getElementById('matFK').textContent = '—';
  document.getElementById('ilist').innerHTML = '<div style="text-align:center;padding:28px 12px;color:var(--tx3);font-size:11px">输入目录并加载图片</div>';
  
  // Hide calibration results
  document.getElementById('noCalib').style.display = 'block';
  document.getElementById('calRes').style.display = 'none';
  document.querySelectorAll('.exbtn').forEach(b => b.disabled = true);
  
  // Clear log
  document.getElementById('logbox').innerHTML = '';
  
  addLog('已清空所有图片', 'info');
  toast('已清空所有图片', 'ok');
}

// ══ Calibrate ══════════════════════════════════════════
async function doCalib() {
  const sq = parseFloat(document.getElementById('sqsz').value);
  addLog('计算标定…', 'info');
  const r = await fetch('/api/calibrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ square_size: sq })
  });
  const d = await r.json();
  if (d.ok) {
    calResult = d.result;
    reportB64 = d.report_b64;
    showCalResult(d.result);
    toast(`标定完成！RMS=${d.result.rms.toFixed(4)}px`, 'ok');
  } else {
    toast(d.error, 'err');
  }
  await refreshLog();
}

function showCalResult(r) {
  document.getElementById('noCalib').style.display = 'none';
  document.getElementById('calRes').style.display = 'block';
  const rv = document.getElementById('rmsv');
  rv.textContent = r.rms.toFixed(4);
  rv.className = 'rmsv ' + (r.rms < 0.5 ? 'rg' : r.rms < 1.5 ? 'ro' : 'rb');
  const K = r.K || r.fisheye_K;
  const fK = r.fisheye_K || r.K;
  if (K) {
    document.getElementById('matK').textContent =
      `[[${K[0].map(v => v.toFixed(1)).join(', ')}],\n [${K[1].map(v => v.toFixed(1)).join(', ')}],\n [${K[2].map(v => v.toFixed(1)).join(', ')}]]`;
  }
  if (fK) {
    document.getElementById('matFK').textContent =
      `[[${fK[0].map(v => v.toFixed(1)).join(', ')}],\n [${fK[1].map(v => v.toFixed(1)).join(', ')}],\n [${fK[2].map(v => v.toFixed(1)).join(', ')}]]`;
  } else {
    document.getElementById('matFK').textContent = '—';
  }
  document.getElementById('distC').innerHTML =
    r.dist
      ? r.dist.map((v, i) => `<span class="cchip">${['k1', 'k2', 'p1', 'p2', 'k3'][i] || 'c' + i}: ${v.toFixed(5)}</span>`).join('')
      : '<span style="color:var(--tx3);font-size:10px">N/A</span>';
  document.getElementById('fishC').innerHTML =
    r.fisheye_D
      ? r.fisheye_D.map((v, i) => `<span class="cchip">k${i + 1}: ${v.toFixed(5)}</span>`).join('')
      : '<span style="color:var(--tx3);font-size:10px">N/A</span>';
  document.querySelectorAll('.exbtn').forEach(b => b.disabled = false);
  updateUndistortSelector();
}

function updateUndistortSelector() {
  const sel = document.getElementById('udSel');
  if (!sel) return;
  if (!images.length) {
    sel.innerHTML = '<option value="">无图片</option>';
    return;
  }
  sel.innerHTML = images.map((im, i) => `<option value="${i}">${i}. ${im.name}</option>`).join('');
  if (curIdx >= 0 && curIdx < images.length) sel.value = String(curIdx);
}

async function previewUndistort() {
  if (!calResult) return toast('请先完成标定', 'warn');
  const sel = document.getElementById('udSel');
  if (!sel || sel.value === '') return toast('请先选择图片', 'warn');
  const idx = parseInt(sel.value, 10);
  if (!Number.isFinite(idx)) return;

  const r = await fetch(`/api/undistort_preview/${idx}`);
  const d = await r.json();
  if (!d.ok) return toast(d.error || '矫正失败', 'err');

  document.getElementById('modalTitle').textContent = `矫正预览 - ${d.name || ''}`;
  document.getElementById('modalImg').style.display = 'none';
  document.getElementById('modalPair').style.display = 'grid';
  document.getElementById('modalOrigImg').src = `data:image/jpeg;base64,${d.orig_b64}`;
  document.getElementById('modalRectImg').src = `data:image/jpeg;base64,${d.undist_b64}`;
  document.getElementById('modalBg').classList.add('show');
}

// ══ Export ═════════════════════════════════════════════
async function doExport(fmt) {
  const r = await fetch(`/api/export/${fmt}`);
  const blob = await r.blob();
  const ext = { json: 'json', yaml: 'yaml' }[fmt];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calibration_params.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`已导出 .${ext}`, 'ok');
}

// ══ Report Modal ═══════════════════════════════════════
function showReport() {
  if (!reportB64) return;
  document.getElementById('modalTitle').textContent = '标定报告';
  document.getElementById('modalPair').style.display = 'none';
  document.getElementById('modalImg').style.display = 'block';
  document.getElementById('modalImg').src = `data:image/png;base64,${reportB64}`;
  document.getElementById('modalBg').classList.add('show');
}

function closeModal() {
  document.getElementById('modalBg').classList.remove('show');
}

// ══ Helpers ════════════════════════════════════════════
function updateCornerUI() {
  if (curIdx < 0) return;
  const exp = parseInt(document.getElementById('cbc').value) * parseInt(document.getElementById('cbr').value);
  const n = corners.length;
  document.getElementById('sc').textContent = n;
  document.getElementById('pCn').textContent = `${n}/${exp}`;
  const el = document.getElementById('pSt');
  if (n === exp) {
    el.textContent = '完整 ✓';
    el.className = 'pval';
  } else if (n > 0) {
    el.textContent = `部分 ${n}/${exp}`;
    el.className = 'pval na';
  } else {
    el.textContent = '无角点';
    el.className = 'pval na';
  }
}

async function refreshLog() {
  const r = await fetch('/api/log');
  const d = await r.json();
  const lb = document.getElementById('logbox');
  lb.innerHTML = d.log.slice(-30).map(l =>
    `<div class="lline ${l.level}"><span class="lt">${l.t}</span><span class="lm">${l.msg}</span></div>`
  ).join('');
  lb.scrollTop = lb.scrollHeight;
}

let toastT;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 3200);
  addLog(msg, type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : 'err');
}

function addLog(msg, level = 'info') {
  const lb = document.getElementById('logbox');
  const t = new Date().toTimeString().slice(0, 8);
  const div = document.createElement('div');
  div.className = `lline ${level}`;
  div.innerHTML = `<span class="lt">${t}</span><span class="lm">${msg}</span>`;
  lb.appendChild(div);
  lb.scrollTop = lb.scrollHeight;
}

// ══ Keyboard Shortcuts ═════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    isSpacePressed = true;
    if (wrap.style.display !== 'none') wrap.style.cursor = 'grab';
    return;
  }
  if (e.key === 'v' || e.key === 'V') setMode('view');
  if (e.key === 'a' || e.key === 'A') setMode('add');
  if (e.key === 'd' || e.key === 'D') setMode('del');
  if (e.key === 'n' || e.key === 'N') setMode('num');
  if (e.key === 'f' || e.key === 'F') fitZoom();
  if (e.key === 'l' || e.key === 'L') toggleLabels();
  if (e.key === 'ArrowRight' && curIdx >= 0 && curIdx < images.length - 1) selectImage(curIdx + 1);
  if (e.key === 'ArrowLeft' && curIdx > 0) selectImage(curIdx - 1);
  if (e.key === 'Escape') { closeModal(); closeIdxPop(); }
});

document.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    isSpacePressed = false;
    if (wrap.style.display !== 'none') {
      wrap.style.cursor = mode === 'view' ? 'default' : 'crosshair';
    }
  }
});

// ══ Initialize ═════════════════════════════════════════
toggleLabels();
addLog('就绪，请上传图片', 'info');
