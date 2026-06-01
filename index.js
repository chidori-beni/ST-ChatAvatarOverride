/**
 * 聊天窗口独立头像 — ST Extension v3.0
 *
 * 存储方案（终版）：
 *   extensionSettings[MODULE_NAME]['chat_avatars'][data-file] = url
 *   key 就是 .recentChat 的 data-file 属性值，天然唯一
 *
 * 入口1：首页列表每行右侧注入「🖼」按钮，点击设置该聊天头像
 * 入口2：聊天窗口内扩展菜单，设置当前聊天头像
 * 效果：首页列表头像实时替换；进入聊天后气泡头像也替换
 */

const MODULE_NAME = 'chat_avatar_override';
const METADATA_KEY = 'custom_char_avatar';   // chatMetadata key（聊天窗口用）
const AVATARS_KEY  = 'chat_avatars';          // extensionSettings key（全局映射）

// ─── Context ────────────────────────────────────────────────

function getCtx() {
    try { return SillyTavern.getContext(); } catch (e) { return null; }
}

// ─── 全局映射：data-file -> url ──────────────────────────────

function getAvatarMap() {
    const ctx = getCtx();
    if (!ctx) return {};
    if (!ctx.extensionSettings[MODULE_NAME])
        ctx.extensionSettings[MODULE_NAME] = {};
    if (!ctx.extensionSettings[MODULE_NAME][AVATARS_KEY])
        ctx.extensionSettings[MODULE_NAME][AVATARS_KEY] = {};
    return ctx.extensionSettings[MODULE_NAME][AVATARS_KEY];
}

async function setAvatarInMap(dataFile, url) {
    const ctx = getCtx();
    if (!ctx || !dataFile) return;
    const map = getAvatarMap();
    if (url) map[dataFile] = url;
    else     delete map[dataFile];
    ctx.saveSettingsDebounced();
    console.log('[CAO] 映射更新:', dataFile, '->', url ? '已设置' : '已清除');
}

// chatMetadata 读写（聊天窗口内用）
function getStoredAvatarUrl() {
    const ctx = getCtx();
    return ctx?.chatMetadata?.[METADATA_KEY] ?? null;
}
async function storeInChatMetadata(url) {
    const ctx = getCtx();
    if (!ctx) return;
    if (url) ctx.chatMetadata[METADATA_KEY] = url;
    else     delete ctx.chatMetadata[METADATA_KEY];
    await ctx.saveMetadata();
}

// 获取当前聊天的 data-file（存在 chatMetadata 里，方便聊天窗口内读取）
// getChatDataFile 已在上方重新定义
async function storeChatDataFile(dataFile) {
    const ctx = getCtx();
    if (!ctx || !dataFile) return;
    ctx.chatMetadata['cao_data_file'] = dataFile;
    await ctx.saveMetadata();
}

// ─── 头像替换：首页列表 ──────────────────────────────────────

function applyAllChatListAvatars() {
    const map = getAvatarMap();
    document.querySelectorAll('.recentChat').forEach(entry => {
        const dataFile = entry.dataset.file ?? '';
        const img = entry.querySelector('.avatar img');
        if (!img) return;
        const url = map[dataFile] ?? null;
        if (url) {
            if (!img.dataset.caoOriginal) img.dataset.caoOriginal = img.src;
            img.src = url;
        } else {
            if (img.dataset.caoOriginal) {
                img.src = img.dataset.caoOriginal;
                delete img.dataset.caoOriginal;
            }
        }
    });
}

function applySingleChatListAvatar(dataFile, url) {
    const entry = document.querySelector(`.recentChat[data-file="${CSS.escape(dataFile)}"]`);
    if (!entry) return;
    const img = entry.querySelector('.avatar img');
    if (!img) return;
    if (url) {
        if (!img.dataset.caoOriginal) img.dataset.caoOriginal = img.src;
        img.src = url;
    } else {
        if (img.dataset.caoOriginal) {
            img.src = img.dataset.caoOriginal;
            delete img.dataset.caoOriginal;
        }
    }
}

// ─── 头像替换：聊天气泡 ──────────────────────────────────────

function applyToChatBubbles(url) {
    document.querySelectorAll('#chat .mes:not([is_user="true"]) .avatar img').forEach(img => {
        if (url) {
            if (!img.dataset.caoOriginal) img.dataset.caoOriginal = img.src;
            img.src = url;
        } else {
            if (img.dataset.caoOriginal) {
                img.src = img.dataset.caoOriginal;
                delete img.dataset.caoOriginal;
            }
        }
    });
}

function refreshChatBubblesFromMap() {
    // 进入聊天后，从全局映射读当前聊天的头像应用到气泡
    const dataFile = getChatDataFile();
    if (!dataFile) {
        // 兜底：从 chatMetadata 读（旧数据兼容）
        const url = getStoredAvatarUrl();
        if (url) applyToChatBubbles(url);
        return;
    }
    const map = getAvatarMap();
    const url = map[dataFile] ?? null;
    // 同步到 chatMetadata（保持一致）
    if (url !== getStoredAvatarUrl()) storeInChatMetadata(url);
    applyToChatBubbles(url);
}

// ─── 图片裁切器 ──────────────────────────────────────────────

const CROP_ID = 'cao_crop_modal';

function openCropper(srcUrl, onDone) {
    document.getElementById(CROP_ID)?.remove();
    const modal = document.createElement('div');
    modal.id = CROP_ID;
    modal.innerHTML = `
        <div class="cao-crop-backdrop"></div>
        <div class="cao-crop-dialog">
            <div class="cao-crop-title">✂️ 裁切图片</div>
            <div class="cao-crop-tip">拖动白框移动 · 拖四角调整大小</div>
            <div class="cao-crop-stage">
                <div class="cao-crop-wrap" id="cao_crop_wrap">
                    <img id="cao_crop_img" src="${srcUrl}" draggable="false"/>
                    <div class="cao-crop-overlay">
                        <div class="cao-crop-box" id="cao_crop_box">
                            <div class="cao-crop-handle nw"></div>
                            <div class="cao-crop-handle ne"></div>
                            <div class="cao-crop-handle sw"></div>
                            <div class="cao-crop-handle se"></div>
                            <div class="cao-crop-grid">
                                <div class="cao-grid-line h1"></div>
                                <div class="cao-grid-line h2"></div>
                                <div class="cao-grid-line v1"></div>
                                <div class="cao-grid-line v2"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="cao-crop-btns">
                <button id="cao_crop_cancel" class="menu_button cao-btn">取消</button>
                <button id="cao_crop_ratio_free" class="menu_button cao-btn cao-btn-ratio active-ratio">自由</button>
                <button id="cao_crop_ratio_sq"   class="menu_button cao-btn cao-btn-ratio">1:1</button>
                <button id="cao_crop_ratio_23"   class="menu_button cao-btn cao-btn-ratio">2:3 ★</button>
                <button id="cao_crop_ratio_169"  class="menu_button cao-btn cao-btn-ratio">16:9</button>
                <button id="cao_crop_ok" class="menu_button cao-btn cao-btn-ok">确认裁切</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const img=modal.querySelector('#cao_crop_img'), wrap=modal.querySelector('#cao_crop_wrap');
    const cropBox=modal.querySelector('#cao_crop_box');
    let fixedRatio=null;

    function rel(e){const r=wrap.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
    function getBox(){return{l:parseInt(cropBox.style.left)||0,t:parseInt(cropBox.style.top)||0,w:parseInt(cropBox.style.width)||100,h:parseInt(cropBox.style.height)||100};}
    function onDrag(e,cb){e.preventDefault();e.stopPropagation();const mm=ev=>cb(ev);const mu=()=>{document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};document.addEventListener('mousemove',mm);document.addEventListener('mouseup',mu);}

    function initBox(){
        const iw=img.offsetWidth,ih=img.offsetHeight;
        wrap.style.width=iw+'px';wrap.style.height=ih+'px';
        const bw=Math.round(iw*.8),bh=Math.round(ih*.8);
        cropBox.style.left=Math.round((iw-bw)/2)+'px';cropBox.style.top=Math.round((ih-bh)/2)+'px';
        cropBox.style.width=bw+'px';cropBox.style.height=bh+'px';
    }
    img.onload=initBox;
    if(img.complete&&img.naturalWidth)initBox();

    const rf=modal.querySelector('#cao_crop_ratio_free'),rs=modal.querySelector('#cao_crop_ratio_sq'),r23=modal.querySelector('#cao_crop_ratio_23'),r169=modal.querySelector('#cao_crop_ratio_169');
    const allRatioBtns=[rf,rs,r23,r169];
    function setRatio(r,btn){fixedRatio=r;allRatioBtns.forEach(b=>b.classList.remove('active-ratio'));btn.classList.add('active-ratio');if(r!==null){const{l,t,w}=getBox();cropBox.style.height=Math.round(w*r)+'px';}}
    rf.onclick=()=>setRatio(null,rf);rs.onclick=()=>setRatio(1,rs);r23.onclick=()=>setRatio(3/2,r23);r169.onclick=()=>setRatio(9/16,r169);

    cropBox.addEventListener('mousedown',e=>{
        if(e.target.classList.contains('cao-crop-handle'))return;
        const{x:sx,y:sy}=rel(e);const{l:sl,t:st,w,h}=getBox();const iw=img.offsetWidth,ih=img.offsetHeight;
        onDrag(e,ev=>{const{x,y}=rel(ev);cropBox.style.left=Math.max(0,Math.min(sl+x-sx,iw-w))+'px';cropBox.style.top=Math.max(0,Math.min(st+y-sy,ih-h))+'px';});
    });
    modal.querySelectorAll('.cao-crop-handle').forEach(handle=>{
        handle.addEventListener('mousedown',e=>{
            const which=[...handle.classList].find(c=>['nw','ne','sw','se'].includes(c));
            const{x:sx,y:sy}=rel(e);const{l:sl,t:st,w:sw,h:sh}=getBox();const iw=img.offsetWidth,ih=img.offsetHeight;
            onDrag(e,ev=>{
                const{x,y}=rel(ev);const dx=x-sx,dy=y-sy;let nl=sl,nt=st,nw=sw,nh=sh;
                if(which==='se'){nw=sw+dx;nh=sh+dy;}if(which==='sw'){nw=sw-dx;nl=sl+dx;nh=sh+dy;}
                if(which==='ne'){nw=sw+dx;nh=sh-dy;nt=st+dy;}if(which==='nw'){nw=sw-dx;nl=sl+dx;nh=sh-dy;nt=st+dy;}
                nw=Math.max(30,nw);nh=fixedRatio!==null?Math.round(nw*fixedRatio):Math.max(30,nh);
                if(nl<0){nw+=nl;nl=0;}if(nt<0){nh+=nt;nt=0;}
                cropBox.style.left=nl+'px';cropBox.style.top=nt+'px';
                cropBox.style.width=Math.min(nw,iw-nl)+'px';cropBox.style.height=Math.min(nh,ih-nt)+'px';
            });
        });
    });
    modal.querySelector('#cao_crop_ok').onclick=()=>{
        const{l,t,w,h}=getBox();const sx=img.naturalWidth/img.offsetWidth,sy=img.naturalHeight/img.offsetHeight;
        const canvas=document.createElement('canvas');canvas.width=Math.round(w*sx);canvas.height=Math.round(h*sy);
        canvas.getContext('2d').drawImage(img,l*sx,t*sy,w*sx,h*sy,0,0,canvas.width,canvas.height);
        modal.remove();onDone(canvas.toDataURL('image/png'));
    };
    modal.querySelector('#cao_crop_cancel').onclick=()=>modal.remove();
    modal.querySelector('.cao-crop-backdrop').onclick=()=>modal.remove();
}

// ─── 设置面板 ────────────────────────────────────────────────
// 通用：传入 dataFile，面板操作的就是这个聊天的头像

const PANEL_ID = 'cao_panel';
let _panelDataFile = null; // 当前面板操作的聊天 data-file

function ensurePanel() {
    if (document.getElementById(PANEL_ID)) return;
    const el = document.createElement('div');
    el.id = PANEL_ID;
    el.innerHTML = `
        <div class="cao-header" id="cao_drag_handle">
            <span>🖼️ 聊天专属头像</span>
            <button class="cao-close" title="关闭">✕</button>
        </div>
        <div class="cao-body">
            <p id="cao_chat_label" class="cao-chat-label"></p>
            <p id="cao_status" class="cao-status">当前使用角色卡原始头像</p>
            <div id="cao_preview_wrap" class="cao-preview-wrap" style="display:none">
                <img id="cao_preview" src="" class="cao-preview-img"/>
            </div>
            <hr class="cao-hr"/>
            <div class="cao-group">
                <span class="cao-label">📁 上传本地图片</span>
                <div class="cao-row">
                    <button id="cao_upload" class="menu_button cao-btn" style="flex:1">
                        <i class="fa-solid fa-upload"></i> 选择图片…
                    </button>
                    <button id="cao_crop_btn" class="menu_button cao-btn cao-btn-crop" title="裁切" style="display:none">✂️ 裁切</button>
                </div>
                <input id="cao_file" type="file" accept="image/*" style="display:none"/>
            </div>
            <div class="cao-group">
                <span class="cao-label">🔗 使用图片 URL</span>
                <div class="cao-row">
                    <input id="cao_url" type="text" class="text_pole cao-url-input" placeholder="粘贴图片链接…"/>
                    <button id="cao_url_ok" class="menu_button cao-btn cao-btn-ok">确认</button>
                </div>
            </div>
            <hr class="cao-hr"/>
            <button id="cao_clear" class="menu_button cao-btn cao-btn-danger" disabled>
                <i class="fa-solid fa-trash-can"></i> 清除，恢复原始头像
            </button>
            <p class="cao-hint">仅影响当前聊天，不修改角色卡文件</p>
        </div>`;
    document.body.appendChild(el);

    let pendingCropUrl = null;

    el.querySelector('#cao_upload').onclick = () => el.querySelector('#cao_file').click();
    el.querySelector('#cao_file').onchange = async function () {
        const file = this.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { toastr.warning('请选择图片文件！'); return; }
        pendingCropUrl = await fileToDataUrl(file);
        el.querySelector('#cao_crop_btn').style.display = '';
        await doApply(_panelDataFile, pendingCropUrl);
        this.value = '';
    };
    el.querySelector('#cao_crop_btn').onclick = () => {
        const src = pendingCropUrl ?? getAvatarMap()[_panelDataFile] ?? null;
        if (!src) { toastr.warning('请先选择一张图片！'); return; }
        hidePanel();
        openCropper(src, async cropped => {
            pendingCropUrl = cropped;
            await doApply(_panelDataFile, cropped);
            showPanel(_panelDataFile);
        });
    };
    el.querySelector('#cao_url_ok').onclick = async () => {
        const url = el.querySelector('#cao_url').value.trim();
        if (!url) { toastr.warning('请输入图片 URL！'); return; }
        pendingCropUrl = url;
        el.querySelector('#cao_crop_btn').style.display = '';
        await doApply(_panelDataFile, url);
        el.querySelector('#cao_url').value = '';
    };
    el.querySelector('#cao_clear').onclick = async () => {
        pendingCropUrl = null;
        el.querySelector('#cao_crop_btn').style.display = 'none';
        await doApply(_panelDataFile, null);
    };
    const closeBtn = el.querySelector('.cao-close');
    closeBtn.addEventListener('click', e => { e.stopPropagation(); hidePanel(); });
    closeBtn.addEventListener('touchend', e => { e.stopPropagation(); e.preventDefault(); hidePanel(); });
    makeDraggable(el, el.querySelector('#cao_drag_handle'));
}

function syncPanelState(dataFile) {
    const url = getAvatarMap()[dataFile] ?? null;
    const label   = document.getElementById('cao_chat_label');
    const status  = document.getElementById('cao_status');
    const wrap    = document.getElementById('cao_preview_wrap');
    const preview = document.getElementById('cao_preview');
    const clearBtn= document.getElementById('cao_clear');
    const cropBtn = document.getElementById('cao_crop_btn');
    if (!status) return;

    // 显示当前操作的聊天名（截短）
    if (label) {
        label.textContent = dataFile.length > 30 ? dataFile.substring(0,28)+'…' : dataFile;
    }
    if (url) {
        status.textContent = '✅ 已设置自定义头像';
        if (preview) preview.src = url;
        if (wrap) wrap.style.display = 'flex';
        if (clearBtn) clearBtn.disabled = false;
        if (cropBtn) cropBtn.style.display = '';
    } else {
        status.textContent = '当前使用角色卡原始头像';
        if (wrap) wrap.style.display = 'none';
        if (clearBtn) clearBtn.disabled = true;
        if (cropBtn) cropBtn.style.display = 'none';
    }
}

function showPanel(dataFile, anchorEl) {
    ensurePanel();
    _panelDataFile = dataFile;
    const panel = document.getElementById(PANEL_ID);
    panel.classList.add('cao-visible');
    syncPanelState(dataFile);

    // 定位：手机端居中，PC端锚点附近
    const isMobile = window.innerWidth < 600 || ('ontouchstart' in window);
    if (isMobile) {
        // 手机：水平居中，垂直居中偏上
        const pw = panel.offsetWidth || 360;
        const ph = panel.offsetHeight || 400;
        panel.style.left = Math.max(8, (window.innerWidth - pw) / 2) + 'px';
        panel.style.top  = Math.max(8, (window.innerHeight - ph) / 2 - 40) + 'px';
        panel.style.maxHeight = (window.innerHeight - 32) + 'px';
        panel.style.overflowY = 'auto';
    } else {
        const anchor = anchorEl ?? document.getElementById('cao_menu_btn');
        if (anchor && (!panel.dataset.dragged)) {
            const r = anchor.getBoundingClientRect();
            const pw = panel.offsetWidth || 360;
            const ph = panel.offsetHeight || 300;
            let left = r.left + r.width/2 - pw/2;
            left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
            let top = r.top - ph - 8;
            if (top < 8) top = r.bottom + 8;
            panel.style.left = left + 'px';
            panel.style.top  = top  + 'px';
        }
    }
}

function hidePanel() {
    document.getElementById(PANEL_ID)?.classList.remove('cao-visible');
}

function togglePanel(dataFile, anchorEl) {
    const panel = document.getElementById(PANEL_ID);
    if (panel?.classList.contains('cao-visible') && _panelDataFile === dataFile) {
        hidePanel();
    } else {
        showPanel(dataFile, anchorEl);
    }
}

document.addEventListener('click', e => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel?.classList.contains('cao-visible')) return;
    if (document.getElementById(CROP_ID)) return;
    if (panel.contains(e.target)) return;
    // 点任何「设置头像」按钮时不关闭（由 togglePanel 处理）
    if (e.target.closest('.cao-set-btn')) return;
    hidePanel();
}, true);

// ─── 首页列表：注入「设置头像」按钮 ─────────────────────────

function injectChatListButtons() {
    document.querySelectorAll('.recentChat').forEach(entry => {
        if (entry.querySelector('.cao-set-btn')) return; // 已注入
        const dataFile = entry.dataset.file;
        if (!dataFile) return;

        const btn = document.createElement('button');
        btn.className = 'menu_button menu_button_icon cao-set-btn interactable';
        btn.title = '设置此聊天的专属头像';
        btn.innerHTML = '<i class="fa-solid fa-image-portrait fa-fw"></i>';
        btn.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
            togglePanel(dataFile, btn);
        });

        // 插在 .chatActions 里（重命名和删除按钮的旁边）
        const actions = entry.querySelector('.chatActions');
        if (actions) {
            actions.insertBefore(btn, actions.firstChild);
        }
    });
}

// 用 MutationObserver 监听列表变化，动态注入按钮+恢复头像
// 监听 .welcomePanel（稳定的祖父容器）
let _listObserver = null;
function startListObserver() {
    _listObserver?.disconnect();
    const container = document.querySelector('.welcomePanel')
        ?? document.querySelector('.welcomeRecent');

    if (!container) {
        // 容器还没渲染，500ms后重试，最多重试10次
        if (!startListObserver._retries) startListObserver._retries = 0;
        if (startListObserver._retries < 10) {
            startListObserver._retries++;
            setTimeout(startListObserver, 500);
        }
        return;
    }
    startListObserver._retries = 0;

    let debounceTimer = null;
    _listObserver = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            injectChatListButtons();
            applyAllChatListAvatars();
        }, 200);
    });
    _listObserver.observe(container, { childList: true, subtree: true });
    console.log('[CAO] 列表监听已启动');
}

// ─── 获取当前聊天的 data-file ────────────────────────────────
// ctx.getCurrentChatId() 直接返回聊天显示名，和 data-file 完全一致！

function getCurrentDataFile() {
    const ctx = getCtx();
    if (!ctx) return null;
    return ctx.getCurrentChatId?.() ?? null;
}

// 兼容旧数据：优先用 getCurrentChatId，其次用 chatMetadata 里存的
function getChatDataFile() {
    return getCurrentDataFile() ?? getCtx()?.chatMetadata?.['cao_data_file'] ?? null;
}

// ─── 聊天窗口内：扩展菜单入口 ───────────────────────────────

function injectMenuButton() {
    if (document.getElementById('cao_menu_btn')) return;
    const menu = document.getElementById('extensionsMenu');
    if (!menu) { setTimeout(injectMenuButton, 1000); return; }
    const item = document.createElement('div');
    item.id = 'cao_menu_btn';
    item.className = 'list-group-item';
    item.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:8px;';
    item.innerHTML = `<i class="fa-solid fa-image-portrait" style="width:18px;text-align:center;"></i><span>聊天窗口独立头像</span>`;
    item.title = '聊天窗口独立头像';
    item.addEventListener('click', e => {
        e.stopPropagation();
        menu.closest('.btn-group')?.querySelector('[data-bs-toggle]')?.click?.();
        setTimeout(() => {
            const dataFile = getChatDataFile();
            if (!dataFile) {
                toastr.warning('请先打开一个聊天再设置头像', '聊天窗口独立头像');
                return;
            }
            togglePanel(dataFile, item);
        }, 80);
    });
    menu.children[15].after(item);
    console.log('[CAO] extensionsMenu 注入成功');
}

// ─── 核心：doApply ───────────────────────────────────────────

async function doApply(dataFile, url) {
    if (!dataFile) { toastr.warning('无法确定聊天文件名'); return; }

    // 1. 存全局映射
    await setAvatarInMap(dataFile, url);

    // 2. 如果是当前打开的聊天，同步 chatMetadata 并替换气泡
    const currentDataFile = getChatDataFile();
    if (currentDataFile === dataFile) {
        await storeInChatMetadata(url);
        applyToChatBubbles(url);
    }

    // 3. 替换首页列表里这一行的头像
    applySingleChatListAvatar(dataFile, url);

    // 4. 刷新面板状态
    syncPanelState(dataFile);

    toastr.success(url ? '已设置专属头像 ✓' : '已恢复原始头像', '聊天窗口独立头像');
}

// ─── 工具 ────────────────────────────────────────────────────

function fileToDataUrl(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.readAsDataURL(file);
    });
}

function makeDraggable(el, handle) {
    let dragging=false,startX,startY,startL,startT;
    handle.style.cursor='move';

    function dragStart(cx, cy) {
        dragging=true;startX=cx;startY=cy;
        startL=parseInt(el.style.left)||0;startT=parseInt(el.style.top)||0;
        el.dataset.dragged='1';
    }
    function dragMove(cx, cy) {
        if(!dragging)return;
        let nl=startL+(cx-startX),nt=startT+(cy-startY);
        nl=Math.max(0,Math.min(nl,window.innerWidth-el.offsetWidth));
        nt=Math.max(0,Math.min(nt,window.innerHeight-el.offsetHeight));
        el.style.left=nl+'px';el.style.top=nt+'px';
    }

    // 鼠标事件
    handle.addEventListener('mousedown',e=>{
        if(e.button!==0)return;
        dragStart(e.clientX,e.clientY);
        e.preventDefault();
    });
    document.addEventListener('mousemove',e=>dragMove(e.clientX,e.clientY));
    document.addEventListener('mouseup',()=>{dragging=false;});

    // 触摸事件（手机）
    handle.addEventListener('touchstart',e=>{
        const t=e.touches[0];
        dragStart(t.clientX,t.clientY);
        e.preventDefault();
    },{passive:false});
    handle.addEventListener('touchmove',e=>{
        const t=e.touches[0];
        dragMove(t.clientX,t.clientY);
        e.preventDefault();
    },{passive:false});
    handle.addEventListener('touchend',()=>{dragging=false;});
}

// ─── Observer：聊天气泡 ──────────────────────────────────────

let _chatObserver = null;
function startChatObserver() {
    _chatObserver?.disconnect();
    const chat = document.getElementById('chat');
    if (!chat) return;
    _chatObserver = new MutationObserver(() => {
        const dataFile = getChatDataFile();
        const url = dataFile ? (getAvatarMap()[dataFile] ?? null) : getStoredAvatarUrl();
        if (url) applyToChatBubbles(url);
    });
    _chatObserver.observe(chat, { childList: true });
}

// ─── 事件 ────────────────────────────────────────────────────

function registerEvents() {
    const ctx = getCtx();
    if (!ctx) return;
    const { eventSource, event_types } = ctx;

    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            // getCurrentChatId() 直接返回当前聊天名，无需任何同步
            refreshChatBubblesFromMap();
            startChatObserver();
            injectChatListButtons();
            applyAllChatListAvatars();
        }, 400);
    });

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        const dataFile = getChatDataFile();
        const url = dataFile ? (getAvatarMap()[dataFile] ?? null) : getStoredAvatarUrl();
        if (url) applyToChatBubbles(url);
    });
}

// ─── 初始化 ──────────────────────────────────────────────────

async function init() {
    console.log('[CAO] 初始化 v3.0…');
    injectMenuButton();
    registerEvents();
    // 延长到1500ms确保首页列表渲染完毕再启动Observer
    setTimeout(() => {
        injectChatListButtons();
        applyAllChatListAvatars();
        startListObserver();
        refreshChatBubblesFromMap();
        startChatObserver();
    }, 1500);
    console.log('[CAO] 完成 ✓');
}

(async () => {
    const ctx = getCtx();
    if (!ctx) { console.error('[CAO] 无法获取 ST context'); return; }
    ctx.eventSource.on(ctx.event_types.APP_READY, () => init());
})();
