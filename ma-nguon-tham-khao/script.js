/* ============================================================
   EMBEDDED DRINK PHOTOS (base64, cropped from the reference PDF)
   ============================================================ */
const DRINK_IMG = {
  "cf-sua": "images/cafe_sua.jpg",
  "cf-da": "images/cafe_da.jpg",
  "cam": "images/cam.jpg",
  "chanh": "images/chanh.jpg",
  "mia": "images/mia.jpg",
  "ngot": "images/ngot.jpg",
  "tratac": "images/tra_tac.jpg",
  "rauma": "images/rau_ma.jpg"
};
const HERO_IMG = "images/hero_cam.jpg";


/* ============================================================
   STORAGE HELPERS
   ============================================================ */
async function storeGet(key, shared){
  try{
    const r = await window.storage.get(key, shared);
    return r ? r.value : null;
  }catch(e){ return null; }
}
async function storeSet(key, value, shared){
  try{
    await window.storage.set(key, value, shared);
    return true;
  }catch(e){ console.error('storage set failed', e); return false; }
}

const MENU_KEY = 'quannuoc:menu';
const SESSION_KEY = 'quannuoc:session';
const HISTORY_KEY = 'quannuoc:history';
const OWNER_PIN = '1110';

const DEFAULT_MENU = [
  {id:'cf-sua',  name:'Café sữa',      price:20000},
  {id:'cf-da',   name:'Café đá',       price:18000},
  {id:'cam',     name:'Nước cam',      price:20000},
  {id:'chanh',   name:'Nước chanh',    price:15000},
  {id:'mia',     name:'Nước mía',      price:15000},
  {id:'ngot',    name:'Nước ngọt',     price:12000},
  {id:'tratac',  name:'Nước trà tắc',  price:15000},
  {id:'rauma',   name:'Nước Rau má',   price:15000},
];

function emptySession(){
  return {active:false, id:null, openedAt:null, orders:[]};
}

/* ============================================================
   APP STATE
   ============================================================ */
let menu = [];
let session = emptySession();
let history = [];
let cart = {};
let ownerUnlocked = false;
let expandedOwnerMenu = new Set();
let expandedCustomerMenu = new Set();

function normalizeMenu(m){
  return (m||[]).map(d => ({...d, children: Array.isArray(d.children) ? d.children : []}));
}

/* ============================================================
   INIT
   ============================================================ */
async function init(){
  let m = await storeGet(MENU_KEY, true);
  if(m){ menu = normalizeMenu(JSON.parse(m)); }
  else { menu = DEFAULT_MENU; await storeSet(MENU_KEY, JSON.stringify(menu), true); }

  let s = await storeGet(SESSION_KEY, true);
  if(s){ session = JSON.parse(s); }
  else { session = emptySession(); await storeSet(SESSION_KEY, JSON.stringify(session), true); }

  let h = await storeGet(HISTORY_KEY, true);
  if(h){ history = JSON.parse(h); }
  else { history = []; await storeSet(HISTORY_KEY, JSON.stringify(history), true); }

  renderPhotoString();
  renderAll();
  setInterval(pollLive, 3500);
}

async function pollLive(){
  const s = await storeGet(SESSION_KEY, true);
  if(s){
    const fresh = JSON.parse(s);
    if(JSON.stringify(fresh) !== JSON.stringify(session)){
      session = fresh;
      renderOwnerSession();
      renderCustomerContent();
    }
  }
  const h = await storeGet(HISTORY_KEY, true);
  if(h){
    const freshH = JSON.parse(h);
    if(JSON.stringify(freshH) !== JSON.stringify(history)){
      history = freshH;
      renderHistory();
    }
  }
  const m = await storeGet(MENU_KEY, true);
  if(m){
    const freshM = normalizeMenu(JSON.parse(m));
    if(JSON.stringify(freshM) !== JSON.stringify(menu)){
      menu = freshM;
      renderMenuEditor();
      renderCustomerContent();
    }
  }
}

function renderAll(){
  renderOwnerSession();
  renderMenuEditor();
  renderHistory();
  renderCustomerContent();
}

/* ============================================================
   HELPERS
   ============================================================ */
function fmt(n){ return Number(n||0).toLocaleString('vi-VN') + 'đ'; }

function drinkImageSrc(d){
  if(d && d.image) return d.image;
  if(d && typeof DRINK_IMG !== 'undefined' && DRINK_IMG[d.id]) return DRINK_IMG[d.id];
  return '';
}

function readAndResizeImage(file, maxW, quality){
  maxW = maxW || 360; quality = quality || 0.75;
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxW){ h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=>reject(new Error('Không đọc được ảnh'));
      img.src = e.target.result;
    };
    reader.onerror = ()=>reject(new Error('Không đọc được tệp'));
    reader.readAsDataURL(file);
  });
}

async function setDrinkImage(id, dataUrl){
  menu = menu.map(d => d.id===id ? {...d, image: dataUrl} : d);
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  renderMenuEditor();
  renderCustomerContent();
  renderPhotoString();
}

async function resetDrinkImage(id){
  menu = menu.map(d=>{
    if(d.id !== id) return d;
    const copy = {...d};
    delete copy.image;
    return copy;
  });
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  renderMenuEditor();
  renderCustomerContent();
  renderPhotoString();
}

function findDrinkById(id){
  for(const d of menu){
    if(d.id === id) return {name:d.name, price:d.price};
    const c = (d.children||[]).find(ch=>ch.id===id);
    if(c) return {name:`${d.name} – ${c.name}`, price:c.price};
  }
  return null;
}

function timeStr(ts){
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}
function dateStr(ts){
  const d = new Date(ts);
  return d.toLocaleDateString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric'}) + ' · ' + timeStr(ts);
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ============================================================
   HERO PHOTO STRING
   ============================================================ */
function renderPhotoString(){
  const box = document.getElementById('photo-string');
  if(!box) return;
  box.innerHTML = menu.map(d=>{
    const img = drinkImageSrc(d);
    if(!img) return '';
    return `
      <div class="polaroid">
        <div class="pin"></div>
        <img src="${img}" alt="${escapeHtml(d.name)}">
        <div class="cap">${escapeHtml(d.name)}</div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   OWNER: SESSION
   ============================================================ */
function renderOwnerSession(){
  const pill = document.getElementById('session-pill');
  const actions = document.getElementById('owner-session-actions');
  const revBox = document.getElementById('owner-revenue');
  const revNum = document.getElementById('owner-revenue-num');
  const orderCount = document.getElementById('owner-order-count');
  const tickets = document.getElementById('owner-tickets');

  if(session.active){
    pill.textContent = 'Đang mở';
    pill.className = 'pill open';
    actions.innerHTML = '<button class="btn btn-stamp" id="close-session-btn">Kết thúc đợt</button>';
    document.getElementById('close-session-btn').onclick = closeSession;

    const total = session.orders.reduce((a,o)=>a+o.total,0);
    revBox.style.display = 'block';
    revNum.textContent = fmt(total);
    orderCount.textContent = session.orders.length;

    if(session.orders.length === 0){
      tickets.innerHTML = '<div class="empty">Chưa có ai đặt nước… đợi khách vào chọn thôi ☕</div>';
    }else{
      tickets.innerHTML = session.orders.slice().reverse().map(o=>`
        <div class="ticket">
          <div class="ticket-top">
            <span>${escapeHtml(o.customerName)}</span>
            <span class="ticket-time">${timeStr(o.time)}</span>
          </div>
          <div class="ticket-items">${o.items.map(i=>`${escapeHtml(i.name)} ×${i.qty}`).join(' · ')}</div>
          <div class="ticket-total">${fmt(o.total)}</div>
        </div>
      `).join('');
    }
  }else{
    pill.textContent = 'Đã đóng';
    pill.className = 'pill closed';
    actions.innerHTML = '<button class="btn btn-primary" id="open-session-btn">Mở đợt mới</button>';
    document.getElementById('open-session-btn').onclick = openSession;
    revBox.style.display = 'none';
    tickets.innerHTML = '<div class="empty">Chưa mở đợt đặt nước nào. Bấm “Mở đợt mới” để khách bắt đầu đặt.</div>';
  }
}

async function openSession(){
  session = {active:true, id:'S'+Date.now(), openedAt:Date.now(), orders:[]};
  await storeSet(SESSION_KEY, JSON.stringify(session), true);
  renderOwnerSession();
  renderCustomerContent();
}

async function closeSession(){
  if(session.orders.length === 0){
    const ok = confirm('Đợt này chưa có đơn nào. Vẫn muốn đóng?');
    if(!ok) return;
  }
  const total = session.orders.reduce((a,o)=>a+o.total,0);
  const entry = {
    id: session.id,
    openedAt: session.openedAt,
    closedAt: Date.now(),
    orders: session.orders,
    totalRevenue: total,
    orderCount: session.orders.length
  };
  history = [entry, ...history];
  await storeSet(HISTORY_KEY, JSON.stringify(history), true);

  session = emptySession();
  await storeSet(SESSION_KEY, JSON.stringify(session), true);

  renderOwnerSession();
  renderHistory();
  renderCustomerContent();
}

/* ============================================================
   OWNER: MENU EDITOR
   ============================================================ */
function renderMenuEditor(){
  const list = document.getElementById('menu-list');
  list.innerHTML = menu.map(d => {
    const img = drinkImageSrc(d);
    const thumb = `
      <label class="thumb-upload" title="Bấm để đổi ảnh">
        ${img ? `<img class="thumb" src="${img}" alt="">` : `<div class="thumb thumb-empty">＋</div>`}
        <input type="file" accept="image/*" class="thumb-file-input" data-id="${d.id}">
      </label>`;
    const children = d.children || [];
    const isOpen = expandedOwnerMenu.has(d.id);
    const arrow = isOpen ? '▾' : '▸';
    const toggleLabel = children.length>0 ? `${arrow} ${children.length} loại con` : `${arrow} Thêm loại con`;
    return `
    <div class="menu-item-block" data-id="${d.id}">
      <div class="menu-row">
        ${thumb}
        <input type="text" class="drink-name-input" value="${escapeHtml(d.name)}">
        <input type="number" class="price-input" value="${d.price}">
        <button class="menu-row-toggle toggle-owner-expand" data-id="${d.id}">${toggleLabel}</button>
        ${d.image ? `<button class="icon-btn reset-image-btn" data-id="${d.id}" title="Khôi phục ảnh mặc định">↺</button>` : ''}
        <button class="icon-btn remove-drink-btn" title="Xoá món">✕</button>
      </div>
      ${isOpen ? renderOwnerSubmenu(d) : ''}
    </div>
  `;}).join('');

  list.querySelectorAll('.menu-item-block').forEach(block=>{
    const id = block.dataset.id;
    block.querySelector('.drink-name-input').addEventListener('change', e=>{
      updateDrink(id, {name: e.target.value});
    });
    block.querySelector('.price-input').addEventListener('change', e=>{
      updateDrink(id, {price: Number(e.target.value)||0});
    });
    block.querySelector('.remove-drink-btn').addEventListener('click', ()=>removeDrink(id));
    block.querySelector('.toggle-owner-expand').addEventListener('click', ()=>{
      if(expandedOwnerMenu.has(id)) expandedOwnerMenu.delete(id);
      else expandedOwnerMenu.add(id);
      renderMenuEditor();
    });
    const fileInput = block.querySelector('.thumb-file-input');
    if(fileInput){
      fileInput.addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        try{
          const dataUrl = await readAndResizeImage(file);
          await setDrinkImage(id, dataUrl);
        }catch(err){
          alert('Không tải được ảnh này, thử ảnh khác nhé.');
        }
      });
    }
    const resetBtn = block.querySelector('.reset-image-btn');
    if(resetBtn){
      resetBtn.addEventListener('click', ()=>resetDrinkImage(id));
    }
    wireOwnerSubmenu(block, id);
  });
}

function renderOwnerSubmenu(d){
  const children = d.children || [];
  const rows = children.map(c => `
    <div class="subchild-row" data-child-id="${c.id}">
      <input type="text" class="child-name-input" value="${escapeHtml(c.name)}">
      <input type="number" class="price-input child-price-input" value="${c.price}">
      <button class="icon-btn remove-child-btn" title="Xoá">✕</button>
    </div>
  `).join('') || '<div class="empty" style="padding:4px 0;text-align:left;">Chưa có loại nước con nào.</div>';

  return `
    <div class="submenu">
      ${rows}
      <div class="add-child-row">
        <input type="text" class="new-child-name" placeholder="Tên loại con… (VD: Ít đường)">
        <input type="number" class="new-child-price" placeholder="Giá">
        <button class="btn btn-ghost add-child-btn">+ Thêm</button>
      </div>
    </div>
  `;
}

function wireOwnerSubmenu(block, parentId){
  const sub = block.querySelector('.submenu');
  if(!sub) return;
  sub.querySelectorAll('.subchild-row').forEach(row=>{
    const childId = row.dataset.childId;
    row.querySelector('.child-name-input').addEventListener('change', e=>{
      updateChild(parentId, childId, {name: e.target.value});
    });
    row.querySelector('.child-price-input').addEventListener('change', e=>{
      updateChild(parentId, childId, {price: Number(e.target.value)||0});
    });
    row.querySelector('.remove-child-btn').addEventListener('click', ()=>removeChild(parentId, childId));
  });
  const addBtn = sub.querySelector('.add-child-btn');
  addBtn.addEventListener('click', ()=>{
    const nameInput = sub.querySelector('.new-child-name');
    const priceInput = sub.querySelector('.new-child-price');
    const name = nameInput.value.trim();
    const price = Number(priceInput.value)||0;
    if(!name) return;
    addChild(parentId, name, price);
  });
  sub.querySelectorAll('.new-child-name, .new-child-price').forEach(inp=>{
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') addBtn.click(); });
  });
}

async function addChild(parentId, name, price){
  const id = 'c'+Date.now()+Math.floor(Math.random()*1000);
  menu = menu.map(d => d.id===parentId ? {...d, children:[...(d.children||[]), {id, name, price}]} : d);
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  renderMenuEditor();
  renderCustomerContent();
}

async function updateChild(parentId, childId, patch){
  menu = menu.map(d=>{
    if(d.id !== parentId) return d;
    return {...d, children:(d.children||[]).map(c => c.id===childId ? {...c, ...patch} : c)};
  });
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  renderCustomerContent();
}

async function removeChild(parentId, childId){
  menu = menu.map(d=>{
    if(d.id !== parentId) return d;
    return {...d, children:(d.children||[]).filter(c => c.id!==childId)};
  });
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  renderMenuEditor();
  renderCustomerContent();
}

async function updateDrink(id, patch){
  menu = menu.map(d => d.id===id ? {...d, ...patch} : d);
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  renderCustomerContent();
  renderPhotoString();
}

async function removeDrink(id){
  menu = menu.filter(d=>d.id!==id);
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  renderMenuEditor();
  renderCustomerContent();
  renderPhotoString();
}

document.getElementById('add-drink-btn').addEventListener('click', async ()=>{
  const nameInput = document.getElementById('new-drink-name');
  const priceInput = document.getElementById('new-drink-price');
  const name = nameInput.value.trim();
  const price = Number(priceInput.value)||0;
  if(!name) return;
  const id = 'd'+Date.now();
  menu = [...menu, {id, name, price, children:[]}];
  await storeSet(MENU_KEY, JSON.stringify(menu), true);
  nameInput.value=''; priceInput.value='';
  renderMenuEditor();
  renderCustomerContent();
});

/* ============================================================
   OWNER: HISTORY / LEDGER
   ============================================================ */
function renderHistory(){
  const summaryBox = document.getElementById('history-summary');
  const box = document.getElementById('history-list');

  if(history.length===0){
    if(summaryBox) summaryBox.innerHTML = '';
    box.innerHTML = '<div class="empty">Sổ còn trống — đóng một đợt đặt nước để lưu lại ở đây.</div>';
    return;
  }

  if(summaryBox){
    const totalRevenueAll = history.reduce((a,h)=>a+h.totalRevenue,0);
    const totalOrdersAll = history.reduce((a,h)=>a+h.orderCount,0);
    summaryBox.innerHTML = `
      <div class="stat">
        <div class="num">${history.length}</div>
        <div class="lbl">Đợt đã đóng</div>
      </div>
      <div class="stat">
        <div class="num">${totalOrdersAll}</div>
        <div class="lbl">Tổng số đơn</div>
      </div>
      <div class="stat revenue">
        <div class="num">${fmt(totalRevenueAll)}</div>
        <div class="lbl">Tổng doanh thu</div>
      </div>
    `;
  }

  box.innerHTML = history.map((h,idx)=>`
    <div class="hist-item" data-idx="${idx}">
      <div class="hist-top">
        <div>
          <div class="hist-date"><span class="chevron">▸</span> ${dateStr(h.closedAt)}</div>
          <div class="hist-meta">${h.orderCount} đơn</div>
        </div>
        <div class="hist-total">${fmt(h.totalRevenue)}</div>
      </div>
      <div class="hist-detail" id="hist-detail-${idx}">
        ${h.orders.map(o=>`
          <div class="hist-order-card">
            <div class="hist-order-top">
              <span class="hist-order-name">${escapeHtml(o.customerName)}</span>
              <span class="hist-order-time">${timeStr(o.time)}</span>
            </div>
            <div class="hist-order-items">
              ${o.items.map(i=>`<span class="hist-item-chip">${escapeHtml(i.name)} ×${i.qty}</span>`).join('')}
            </div>
            <div class="hist-order-total">${fmt(o.total)}</div>
          </div>
        `).join('') || '<div class="empty">Không có đơn nào.</div>'}
      </div>
    </div>
  `).join('');

  box.querySelectorAll('.hist-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const idx = el.dataset.idx;
      el.classList.toggle('open');
      document.getElementById('hist-detail-'+idx).classList.toggle('open');
    });
  });
}

/* ============================================================
   CUSTOMER VIEW
   ============================================================ */
function renderCustomerContent(){
  const box = document.getElementById('customer-content');

  if(!session.active){
    box.innerHTML = `
      <div class="closed-state">
        <div class="big">🌙</div>
        <div><strong>Hiện chưa có đợt đặt nước nào.</strong></div>
        <div style="margin-top:4px;font-size:13px;">Chờ chủ quán mở đợt mới rồi quay lại đặt nhé!</div>
      </div>`;
    return;
  }

  if(menu.length===0){
    box.innerHTML = '<div class="closed-state"><div class="big">🥤</div>Menu đang trống, chờ chủ quán thêm món nhé.</div>';
    return;
  }

  box.innerHTML = `
    <div class="customer-layout">
      <div class="col-drinks">
        <div class="drink-grid" id="drink-grid"></div>
      </div>
      <div class="col-cart">
        <div class="cart-panel" id="cart-panel">
          <h3>🧾 Đơn của bạn</h3>
          <div class="cart-items" id="cart-items"></div>
          <div class="cart-panel-total">
            <span class="lbl">Tổng cộng</span>
            <span class="num" id="cart-total-desktop">0đ</span>
          </div>
          <button class="btn btn-stamp btn-block" id="submit-order-btn-desktop">Gửi đơn</button>
        </div>
      </div>
    </div>
    <div class="cart-bar mobile-only">
      <div>
        <div class="cart-lbl">Tổng cộng</div>
        <div class="cart-total" id="cart-total">0đ</div>
      </div>
      <button id="submit-order-btn">Gửi đơn</button>
    </div>
  `;
  renderDrinkGrid();
  updateCartBar();

  document.getElementById('submit-order-btn').onclick = submitOrder;
  document.getElementById('submit-order-btn-desktop').onclick = submitOrder;
}

function renderDrinkGrid(){
  const grid = document.getElementById('drink-grid');
  if(!grid) return;
  grid.innerHTML = menu.map(d=>{
    const img = drinkImageSrc(d);
    const thumb = img ? `<img class="drink-thumb" src="${img}" alt="">` : `<div class="drink-thumb" style="background:var(--jade-pale);"></div>`;
    const children = d.children || [];
    const isOpen = expandedCustomerMenu.has(d.id);
    const toggleBtn = children.length>0
      ? `<button class="expand-toggle toggle-customer-expand" data-id="${d.id}">${isOpen?'▾':'▸'} ${children.length} lựa chọn khác</button>`
      : '';
    return `
    <div class="drink-card" data-id="${d.id}">
      <div class="drink-card-head">
        <div class="drink-info">
          ${thumb}
          <div>
            <div class="drink-name">${escapeHtml(d.name)}</div>
            <div class="drink-price">${fmt(d.price)}</div>
          </div>
        </div>
        <div class="stepper">
          <button class="dec-btn" data-id="${d.id}">−</button>
          <span class="qty" id="qty-${d.id}">${cart[d.id]||0}</span>
          <button class="inc-btn" data-id="${d.id}">+</button>
        </div>
      </div>
      ${toggleBtn}
      ${isOpen ? renderCustomerSubDrinks(children) : ''}
    </div>
  `;}).join('');

  grid.querySelectorAll('.toggle-customer-expand').forEach(b=>b.addEventListener('click',()=>{
    const id = b.dataset.id;
    if(expandedCustomerMenu.has(id)) expandedCustomerMenu.delete(id);
    else expandedCustomerMenu.add(id);
    renderDrinkGrid();
    updateCartBar();
  }));
  grid.querySelectorAll('.inc-btn').forEach(b=>b.addEventListener('click',()=>{
    cart[b.dataset.id] = (cart[b.dataset.id]||0)+1;
    document.getElementById('qty-'+b.dataset.id).textContent = cart[b.dataset.id];
    updateCartBar();
  }));
  grid.querySelectorAll('.dec-btn').forEach(b=>b.addEventListener('click',()=>{
    cart[b.dataset.id] = Math.max(0,(cart[b.dataset.id]||0)-1);
    document.getElementById('qty-'+b.dataset.id).textContent = cart[b.dataset.id];
    updateCartBar();
  }));
}

function renderCustomerSubDrinks(children){
  return `
    <div class="sub-drinks">
      ${children.map(c=>`
        <div class="sub-drink-row">
          <div class="sub-drink-info">
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="price">${fmt(c.price)}</div>
          </div>
          <div class="stepper">
            <button class="dec-btn" data-id="${c.id}">−</button>
            <span class="qty" id="qty-${c.id}">${cart[c.id]||0}</span>
            <button class="inc-btn" data-id="${c.id}">+</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function cartTotal(){
  let total = 0;
  for(const id in cart){
    const qty = cart[id];
    if(qty<=0) continue;
    const info = findDrinkById(id);
    if(info) total += info.price*qty;
  }
  return total;
}

function updateCartBar(){
  const totalEl = document.getElementById('cart-total');
  const totalDesktopEl = document.getElementById('cart-total-desktop');
  const btn = document.getElementById('submit-order-btn');
  const btnDesktop = document.getElementById('submit-order-btn-desktop');
  const itemsBox = document.getElementById('cart-items');
  if(!totalEl) return;

  const total = cartTotal();
  const hasItems = Object.values(cart).some(q=>q>0);

  totalEl.textContent = fmt(total);
  if(totalDesktopEl) totalDesktopEl.textContent = fmt(total);
  btn.disabled = !hasItems;
  if(btnDesktop) btnDesktop.disabled = !hasItems;

  if(itemsBox){
    const lines = Object.keys(cart).filter(id=>cart[id]>0).map(id=>{
      const info = findDrinkById(id);
      if(!info) return '';
      return `
        <div class="cart-line">
          <span class="cl-name">${escapeHtml(info.name)} <span class="cl-qty">×${cart[id]}</span></span>
          <span class="cl-price">${fmt(info.price*cart[id])}</span>
        </div>`;
    }).join('');
    itemsBox.innerHTML = lines || '<div class="cart-panel-empty">Chưa chọn món nào — bấm + trên món bạn muốn nhé.</div>';
  }
}

async function submitOrder(){
  const nameInput = document.getElementById('customer-name');
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); nameInput.style.borderColor = 'var(--hibiscus)'; return; }

  const items = Object.keys(cart).filter(id=>cart[id]>0).map(id=>{
    const info = findDrinkById(id);
    return {id, name:info.name, price:info.price, qty:cart[id]};
  });
  if(items.length===0) return;

  const s = await storeGet(SESSION_KEY, true);
  const freshSession = s ? JSON.parse(s) : session;
  if(!freshSession.active){
    session = freshSession;
    renderCustomerContent();
    return;
  }

  const order = {
    id:'O'+Date.now()+Math.floor(Math.random()*1000),
    customerName:name,
    items,
    total: items.reduce((a,i)=>a+i.price*i.qty,0),
    time: Date.now()
  };
  freshSession.orders = [...freshSession.orders, order];
  session = freshSession;
  await storeSet(SESSION_KEY, JSON.stringify(session), true);

  cart = {};
  renderCustomerContent();
  renderOwnerSession();
  showStamp();
}

function showStamp(){
  const t = document.getElementById('stamp-toast');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1600);
}

/* ============================================================
   OWNER PIN LOCK (fixed code, cannot be changed in-app)
   ============================================================ */
function switchToRole(role){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.role===role));
  document.getElementById('view-owner').classList.toggle('active', role==='owner');
  document.getElementById('view-customer').classList.toggle('active', role==='customer');
}

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const role = btn.dataset.role;
    if(role === 'customer'){ switchToRole('customer'); return; }
    if(ownerUnlocked){ switchToRole('owner'); return; }
    openPinModal();
  });
});

function openPinModal(){
  const overlay = document.getElementById('pin-overlay');
  const input = document.getElementById('pin-input');
  document.getElementById('pin-error').textContent = '';
  input.value = '';
  overlay.classList.add('show');
  setTimeout(()=>input.focus(), 50);
}

function closePinModal(){
  document.getElementById('pin-overlay').classList.remove('show');
}

document.getElementById('pin-cancel').addEventListener('click', closePinModal);
document.getElementById('pin-input').addEventListener('keydown', e=>{
  if(e.key === 'Enter') document.getElementById('pin-submit').click();
});

document.getElementById('pin-submit').addEventListener('click', ()=>{
  const val = document.getElementById('pin-input').value.trim();
  const errEl = document.getElementById('pin-error');
  if(val === OWNER_PIN){
    ownerUnlocked = true;
    closePinModal();
    switchToRole('owner');
  }else{
    errEl.textContent = 'Sai mã, thử lại nhé.';
  }
});

/* ============================================================
   OWNER SUB-TABS (Quản lý quán / Sổ ghi chép)
   ============================================================ */
document.querySelectorAll('.owner-subtab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = btn.dataset.subtab;
    document.querySelectorAll('.owner-subtab-btn').forEach(b=>b.classList.toggle('active', b===btn));
    document.getElementById('owner-subview-dashboard').classList.toggle('active', target==='dashboard');
    document.getElementById('owner-subview-history').classList.toggle('active', target==='history');
  });
});

init();
