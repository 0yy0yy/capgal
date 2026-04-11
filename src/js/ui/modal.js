/**
 * AUTHOR: Claude.ai
 * modal.js — Programmatic floating modal system
 *
 * API:
 *   Modal.confirm({ question, yesLabel?, noLabel? })
 *     → Promise<boolean>
 *
 *   Modal.addItem({ type: 'category' | 'cap', categories?: Array<{id, name, color}> })
 *     → Promise<CategoryResult | CapResult | null>   (null = cancelled)
 *
 *   CategoryResult: { name: string, color: string }
 *   CapResult:      { image: File|Blob|null, tag: string|'__new__', tagName?: string, description: string }
 *
 * External image integration:
 *   Before opening a cap modal you can pre-load an image via:
 *     Modal.setPendingImage(blobOrFile)
 *   The modal will display a preview of it and include it in the result.
 *   If no image is pre-loaded, the user sees an upload slot instead.
 */

const Modal = (() => {
   /* ─── State ──────────────────────────────────────────────────────────── */
   let _pendingImage = null;     // set from outside before opening cap modal
   let _activeResolve = null;    // promise resolver for current modal
   let _overlay = null;          // current DOM overlay

   /* ─── Styles ─────────────────────────────────────────────────────────── */
   const STYLE_ID = '__modal_styles__';
   const injectStyles = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Syne:wght@400;600;700;800&display=swap');

      /* ── Overlay ── */
      .mdl-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(10, 10, 12, 0.72);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        animation: mdl-overlay-in 0.18s ease;
      }
      @keyframes mdl-overlay-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      /* ── Box ── */
      .mdl-box {
        background: #f5f2ec;
        color: #1a1a1a;
        border: 1.5px solid #1a1a1a;
        border-radius: 2px;
        box-shadow: 6px 6px 0 #1a1a1a;
        width: 100%;
        max-width: 480px;
        font-family: 'Syne', sans-serif;
        animation: mdl-box-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        overflow: hidden;
      }
      @keyframes mdl-box-in {
        from { opacity: 0; transform: translateY(18px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0)   scale(1);     }
      }

      /* ── Header ── */
      .mdl-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.9rem 1.25rem 0.75rem;
        border-bottom: 1.5px solid #1a1a1a;
        background: #1a1a1a;
        color: #f5f2ec;
      }
      .mdl-header-label {
        font-family: 'DM Mono', monospace;
        font-size: 0.65rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0.55;
      }
      .mdl-header-title {
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        margin-top: 2px;
      }
      .mdl-close {
        background: none;
        border: 1.5px solid rgba(245,242,236,0.3);
        color: #f5f2ec;
        width: 28px;
        height: 28px;
        border-radius: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        line-height: 1;
        transition: background 0.15s, border-color 0.15s;
        flex-shrink: 0;
      }
      .mdl-close:hover {
        background: rgba(245,242,236,0.12);
        border-color: rgba(245,242,236,0.6);
      }

      /* ── Body ── */
      .mdl-body {
        padding: 1.5rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }

      /* ── Confirm question ── */
      .mdl-question {
        font-size: 1.05rem;
        font-weight: 600;
        line-height: 1.45;
        color: #1a1a1a;
      }

      /* ── Field ── */
      .mdl-field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .mdl-label {
        font-family: 'DM Mono', monospace;
        font-size: 0.62rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #555;
      }
      .mdl-label span.mdl-required {
        color: #c0392b;
        margin-left: 2px;
      }

      /* ── Inputs ── */
      .mdl-input,
      .mdl-textarea,
      .mdl-select {
        background: #fff;
        border: 1.5px solid #bbb;
        border-radius: 2px;
        padding: 0.55rem 0.75rem;
        font-family: 'Syne', sans-serif;
        font-size: 0.9rem;
        color: #1a1a1a;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
        width: 100%;
        box-sizing: border-box;
      }
      .mdl-input:focus,
      .mdl-textarea:focus,
      .mdl-select:focus {
        border-color: #1a1a1a;
        box-shadow: 3px 3px 0 #1a1a1a;
      }
      .mdl-textarea {
        resize: vertical;
        min-height: 90px;
        line-height: 1.5;
      }
      .mdl-char-count {
        font-family: 'DM Mono', monospace;
        font-size: 0.6rem;
        color: #999;
        text-align: right;
        margin-top: -0.2rem;
        transition: color 0.15s;
      }
      .mdl-char-count.warn  { color: #e67e22; }
      .mdl-char-count.over  { color: #c0392b; }

      /* ── Color row ── */
      .mdl-color-row {
        display: flex;
        align-items: center;
        gap: 0.65rem;
      }
      .mdl-color-swatch {
        width: 36px;
        height: 36px;
        border-radius: 2px;
        border: 1.5px solid #bbb;
        flex-shrink: 0;
        cursor: pointer;
        transition: box-shadow 0.15s;
        overflow: hidden;
        padding: 0;
        background: none;
      }
      .mdl-color-swatch:focus { outline: none; box-shadow: 3px 3px 0 #1a1a1a; }
      .mdl-color-swatch input[type="color"] {
        width: 150%;
        height: 150%;
        margin: -25%;
        border: none;
        cursor: pointer;
        opacity: 0;
        position: absolute;
      }
      .mdl-color-swatch { position: relative; }
      .mdl-color-preview {
        position: absolute;
        inset: 0;
        border-radius: 1px;
        pointer-events: none;
      }
      .mdl-input.mdl-hex {
        font-family: 'DM Mono', monospace;
        font-size: 0.82rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        width: auto;
        flex: 1;
      }

      /* ── Image slot ── */
      .mdl-image-slot {
        border: 1.5px dashed #bbb;
        border-radius: 2px;
        background: #fff;
        min-height: 110px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 0.5rem;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        position: relative;
        overflow: hidden;
      }
      .mdl-image-slot:hover { border-color: #1a1a1a; background: #f9f7f2; }
      .mdl-image-slot input[type="file"] {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
        width: 100%;
        height: 100%;
      }
      .mdl-image-slot img {
        max-width: 100%;
        max-height: 140px;
        object-fit: contain;
        display: block;
      }
      .mdl-image-slot-hint {
        font-family: 'DM Mono', monospace;
        font-size: 0.62rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #aaa;
        text-align: center;
        pointer-events: none;
      }
      .mdl-image-icon {
        font-size: 1.6rem;
        line-height: 1;
        pointer-events: none;
      }

      /* ── Tag / select ── */
      .mdl-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%231a1a1a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 0.75rem center; padding-right: 2.2rem; cursor: pointer; }

      .mdl-new-category-inline {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.85rem;
        border: 1.5px solid #ddd;
        border-radius: 2px;
        background: #fffef9;
        margin-top: 0.2rem;
        animation: mdl-box-in 0.18s ease;
      }
      .mdl-new-category-inline .mdl-label {
        color: #888;
      }

      /* ── Error ── */
      .mdl-error {
        font-family: 'DM Mono', monospace;
        font-size: 0.62rem;
        letter-spacing: 0.1em;
        color: #c0392b;
        text-transform: uppercase;
        padding: 0.5rem 0.65rem;
        background: #fff0ee;
        border: 1px solid #f5c6c0;
        border-radius: 2px;
        display: none;
      }
      .mdl-error.visible { display: block; }

      /* ── Footer / actions ── */
      .mdl-footer {
        display: flex;
        gap: 0.6rem;
        padding: 1rem 1.25rem 1.25rem;
        border-top: 1.5px solid #e0ddd6;
        justify-content: flex-end;
      }
      .mdl-btn {
        font-family: 'Syne', sans-serif;
        font-weight: 700;
        font-size: 0.82rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 0.55rem 1.1rem;
        border-radius: 2px;
        cursor: pointer;
        border: 1.5px solid transparent;
        transition: transform 0.12s, box-shadow 0.12s, background 0.12s;
      }
      .mdl-btn:active { transform: translate(2px, 2px); box-shadow: none !important; }

      .mdl-btn-ghost {
        background: transparent;
        border-color: #bbb;
        color: #555;
      }
      .mdl-btn-ghost:hover { border-color: #1a1a1a; color: #1a1a1a; }

      .mdl-btn-danger {
        background: #fff0ee;
        border-color: #c0392b;
        color: #c0392b;
        box-shadow: 3px 3px 0 #c0392b;
      }
      .mdl-btn-danger:hover { background: #c0392b; color: #fff; }

      .mdl-btn-primary {
        background: #1a1a1a;
        border-color: #1a1a1a;
        color: #f5f2ec;
        box-shadow: 3px 3px 0 rgba(26,26,26,0.25);
      }
      .mdl-btn-primary:hover { background: #333; box-shadow: 4px 4px 0 rgba(26,26,26,0.3); }

      /* ── Separator ── */
      .mdl-sep {
        border: none;
        border-top: 1px solid #e0ddd6;
        margin: 0;
      }

      /* ── Scrollable body for long forms ── */
      .mdl-body-scroll {
        max-height: calc(100vh - 240px);
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #ccc transparent;
      }
    `;
      document.head.appendChild(style);
   };

   /* ─── Utilities ──────────────────────────────────────────────────────── */
   const el = (tag, cls, attrs = {}) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
      return e;
   };

   const label = (text, required = false) => {
      const l = el('div', 'mdl-label');
      l.textContent = text;
      if (required) {
         const s = el('span', 'mdl-required');
         s.textContent = ' *';
         l.appendChild(s);
      }
      return l;
   };

   const field = (...children) => {
      const f = el('div', 'mdl-field');
      children.forEach(c => f.appendChild(c));
      return f;
   };

   /* ─── Core: mount & unmount ──────────────────────────────────────────── */
   const mount = (boxContent) => {
      close(); // close any existing modal first
      injectStyles();

      _overlay = el('div', 'mdl-overlay');
      const box = el('div', 'mdl-box');
      box.appendChild(boxContent);
      _overlay.appendChild(box);

      // Click outside → cancel
      _overlay.addEventListener('click', e => {
         if (e.target === _overlay) _resolve(null);
      });
      // Esc key → cancel
      const onKey = e => { if (e.key === 'Escape') { _resolve(null); } };
      document.addEventListener('keydown', onKey);
      _overlay._onKey = onKey;

      document.body.appendChild(_overlay);
      return box;
   };

   const close = () => {
      if (_overlay) {
         document.removeEventListener('keydown', _overlay._onKey);
         _overlay.remove();
         _overlay = null;
      }
      _activeResolve = null;
   };

   // Resolves the active promise and closes the modal
   const _resolve = (value) => {
      const fn = _activeResolve;
      close();
      if (fn) fn(value);
   };

   /* ─── makeHeader ─────────────────────────────────────────────────────── */
   const makeHeader = (superLabel, title, showClose = true) => {
      const h = el('div', 'mdl-header');
      const left = el('div');
      const lbl = el('div', 'mdl-header-label');
      lbl.textContent = superLabel;
      const ttl = el('div', 'mdl-header-title');
      ttl.textContent = title;
      left.appendChild(lbl);
      left.appendChild(ttl);
      h.appendChild(left);
      if (showClose) {
         const btn = el('button', 'mdl-close');
         btn.setAttribute('aria-label', 'Close');
         btn.innerHTML = '&times;';
         btn.addEventListener('click', () => _resolve(null));
         h.appendChild(btn);
      }
      return h;
   };

   /* ─── makeError ──────────────────────────────────────────────────────── */
   const makeError = () => {
      const e = el('div', 'mdl-error');
      e.show = (msg) => { e.textContent = msg; e.classList.add('visible'); };
      e.hide = () => e.classList.remove('visible');
      return e;
   };

   /* ═══════════════════════════════════════════════════════════════════════
      PUBLIC: Modal.confirm
      ═══════════════════════════════════════════════════════════════════════ */
   /**
    * @param {object} opts
    * @param {string} opts.question
    * @param {string} [opts.yesLabel='Yes']
    * @param {string} [opts.noLabel='No']
    * @returns {Promise<boolean>}  true = yes, false = no, null = dismissed
    */
   const confirm = ({ question, yesLabel = 'Yes', noLabel = 'No' } = {}) => {
      return new Promise(resolve => {
         _activeResolve = resolve;

         const frag = document.createDocumentFragment();

         frag.appendChild(makeHeader('Confirmation', 'Are you sure?', true));

         const body = el('div', 'mdl-body');
         const q = el('div', 'mdl-question');
         q.textContent = question || 'Do you want to proceed?';
         body.appendChild(q);
         frag.appendChild(body);

         const footer = el('div', 'mdl-footer');

         const noBtn = el('button', 'mdl-btn mdl-btn-ghost');
         noBtn.textContent = noLabel;
         noBtn.addEventListener('click', () => _resolve(false));

         const yesBtn = el('button', 'mdl-btn mdl-btn-danger');
         yesBtn.textContent = yesLabel;
         yesBtn.addEventListener('click', () => _resolve(true));

         footer.appendChild(noBtn);
         footer.appendChild(yesBtn);
         frag.appendChild(footer);

         mount(frag);
      });
   };

   /* ═══════════════════════════════════════════════════════════════════════
      INTERNAL: buildCategoryForm
      ═══════════════════════════════════════════════════════════════════════ */
   /**
    * Builds the category name + color fields.
    * Returns { container, getData } where getData() returns { name, color }
    * or null if invalid (and marks the error visually).
    */
   const buildCategoryForm = (errorEl) => {
      const container = document.createDocumentFragment();

      // Name
      const nameInput = el('input', 'mdl-input');
      nameInput.type = 'text';
      nameInput.placeholder = 'e.g. Snapbacks';
      nameInput.maxLength = 60;
      container.appendChild(field(label('Category name', true), nameInput));

      // Color
      let currentColor = '#3B82F6';
      const colorField = el('div', 'mdl-field');
      colorField.appendChild(label('Accent color', true));

      const colorRow = el('div', 'mdl-color-row');

      // Swatch button (wraps hidden color input)
      const swatchBtn = el('button', 'mdl-color-swatch');
      swatchBtn.setAttribute('aria-label', 'Pick color');
      swatchBtn.setAttribute('type', 'button');
      const colorPreview = el('div', 'mdl-color-preview');
      colorPreview.style.background = currentColor;
      const colorInput = el('input');
      colorInput.type = 'color';
      colorInput.value = currentColor;
      swatchBtn.appendChild(colorPreview);
      swatchBtn.appendChild(colorInput);

      // Hex text input
      const hexInput = el('input', 'mdl-input mdl-hex');
      hexInput.type = 'text';
      hexInput.value = currentColor;
      hexInput.placeholder = '#3B82F6';
      hexInput.maxLength = 7;

      const syncColor = (hex) => {
         const valid = /^#[0-9A-Fa-f]{6}$/.test(hex);
         if (!valid) return;
         currentColor = hex.toUpperCase();
         colorPreview.style.background = currentColor;
         colorInput.value = currentColor;
         hexInput.value = currentColor;
      };

      colorInput.addEventListener('input', () => syncColor(colorInput.value));
      hexInput.addEventListener('input', () => {
         let v = hexInput.value.trim();
         if (!v.startsWith('#')) v = '#' + v;
         syncColor(v);
      });
      hexInput.addEventListener('blur', () => {
         if (!/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) hexInput.value = currentColor;
      });

      colorRow.appendChild(swatchBtn);
      colorRow.appendChild(hexInput);
      colorField.appendChild(colorRow);
      container.appendChild(colorField);

      const getData = () => {
         const name = nameInput.value.trim();
         if (!name) { errorEl.show('Category name is required.'); nameInput.focus(); return null; }
         errorEl.hide();
         return { name, color: currentColor };
      };

      return { container, getData, focusFirst: () => nameInput.focus() };
   };

   /* ═══════════════════════════════════════════════════════════════════════
      INTERNAL: buildCapForm
      ═══════════════════════════════════════════════════════════════════════ */
   /**
    * @param {Array<{id, name, color}>} categories  existing categories
    * @param {Blob|File|null} pendingImage           pre-loaded image
    * @param {Function} errorEl                      error display element
    */
   const buildCapForm = (categories, pendingImage, errorEl) => {
      const container = document.createDocumentFragment();
      let imageFile = pendingImage || null;

      /* ── Image slot ── */
      const imageField = el('div', 'mdl-field');
      imageField.appendChild(label('Cap image'));

      const imageSlot = el('div', 'mdl-image-slot');
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.setAttribute('aria-label', 'Upload cap image');

      const imgPreview = el('img');
      imgPreview.alt = 'Cap preview';
      imgPreview.style.display = 'none';

      const slotIcon = el('div', 'mdl-image-icon');
      slotIcon.textContent = '🧢';
      const slotHint = el('div', 'mdl-image-slot-hint');
      slotHint.textContent = 'Click to upload or drag an image';

      imageSlot.appendChild(fileInput);
      imageSlot.appendChild(imgPreview);
      imageSlot.appendChild(slotIcon);
      imageSlot.appendChild(slotHint);
      imageField.appendChild(imageSlot);
      container.appendChild(imageField);

      const showImagePreview = (src) => {
         imgPreview.src = src;
         imgPreview.style.display = 'block';
         slotIcon.style.display = 'none';
         slotHint.style.display = 'none';
      };

      // If a pending image was pre-loaded, show it immediately
      if (pendingImage) {
         showImagePreview(URL.createObjectURL(pendingImage));
      }

      fileInput.addEventListener('change', () => {
         const f = fileInput.files[0];
         if (f) {
            imageFile = f;
            showImagePreview(URL.createObjectURL(f));
         }
      });

      // Drag & drop
      imageSlot.addEventListener('dragover', e => { e.preventDefault(); imageSlot.style.borderColor = '#1a1a1a'; });
      imageSlot.addEventListener('dragleave', () => { imageSlot.style.borderColor = ''; });
      imageSlot.addEventListener('drop', e => {
         e.preventDefault();
         imageSlot.style.borderColor = '';
         const f = e.dataTransfer.files[0];
         if (f && f.type.startsWith('image/')) {
            imageFile = f;
            showImagePreview(URL.createObjectURL(f));
         }
      });

      container.appendChild(el('hr', 'mdl-sep'));

      /* ── Tag / category select ── */
      const tagField = el('div', 'mdl-field');
      tagField.appendChild(label('Category tag', true));

      const tagSelect = el('select', 'mdl-select');

      const placeholderOpt = el('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = '— Select a category —';
      placeholderOpt.disabled = true;
      placeholderOpt.selected = true;
      tagSelect.appendChild(placeholderOpt);

      (categories || []).forEach(cat => {
         const opt = el('option');
         opt.value = cat.id ?? cat.name;
         opt.textContent = cat.name;
         tagSelect.appendChild(opt);
      });

      const newCatOpt = el('option');
      newCatOpt.value = '__new__';
      newCatOpt.textContent = '＋ Add a new category…';
      tagSelect.appendChild(newCatOpt);
      tagField.appendChild(tagSelect);
      container.appendChild(tagField);

      /* ── Inline "new category" form (shown when __new__ is selected) ── */
      const newCatWrapper = el('div');
      newCatWrapper.style.display = 'none';
      let inlineCatData = null;

      tagSelect.addEventListener('change', () => {
         if (tagSelect.value === '__new__') {
            newCatWrapper.style.display = 'block';
         } else {
            newCatWrapper.style.display = 'none';
         }
      });

      // Build the inline form using buildCategoryForm in a sub-container
      const inlineError = makeError();
      const { container: inlineFields, getData: getInlineCat, focusFirst: focusInlineFirst } = buildCategoryForm(inlineError);

      const inlineBox = el('div', 'mdl-new-category-inline');
      const inlineLbl = el('div', 'mdl-label');
      inlineLbl.textContent = 'New category details';
      inlineLbl.style.marginBottom = '0.25rem';
      inlineBox.appendChild(inlineLbl);
      inlineBox.appendChild(inlineFields);
      inlineBox.appendChild(inlineError);
      newCatWrapper.appendChild(inlineBox);
      container.appendChild(newCatWrapper);

      tagSelect.addEventListener('change', () => {
         if (tagSelect.value === '__new__') setTimeout(focusInlineFirst, 50);
      });

      container.appendChild(el('hr', 'mdl-sep'));

      /* ── Description ── */
      const MAX_DESC = 280;
      const descField = el('div', 'mdl-field');
      descField.appendChild(label('Description', false));
      const descArea = el('textarea', 'mdl-textarea');
      descArea.placeholder = 'Tell the story of this cap… (optional, up to 280 characters)';
      descArea.maxLength = MAX_DESC;
      const charCount = el('div', 'mdl-char-count');
      charCount.textContent = `0 / ${MAX_DESC}`;

      descArea.addEventListener('input', () => {
         const len = descArea.value.length;
         charCount.textContent = `${len} / ${MAX_DESC}`;
         charCount.className = 'mdl-char-count' + (len > MAX_DESC * 0.9 ? (len >= MAX_DESC ? ' over' : ' warn') : '');
      });

      descField.appendChild(descArea);
      descField.appendChild(charCount);
      container.appendChild(descField);

      /* ── getData ── */
      const getData = () => {
         const tagVal = tagSelect.value;
         if (!tagVal) { errorEl.show('Please select or create a category tag.'); tagSelect.focus(); return null; }

         let newCategory = null;
         if (tagVal === '__new__') {
            newCategory = getInlineCat(); // validates internally
            if (!newCategory) return null; // inline error shown inside
         }

         const description = descArea.value.trim();
         if (description.length > MAX_DESC) { errorEl.show(`Description must be ${MAX_DESC} characters or fewer.`); descArea.focus(); return null; }

         errorEl.hide();
         return {
            image: imageFile,
            tag: tagVal,
            ...(newCategory ? { newCategory } : {}),
            description,
         };
      };

      return { container, getData };
   };

   /* ═══════════════════════════════════════════════════════════════════════
      PUBLIC: Modal.addItem
      ═══════════════════════════════════════════════════════════════════════ */
   /**
    * @param {object} opts
    * @param {'category'|'cap'} opts.type
    * @param {Array<{id, name, color}>} [opts.categories]  required when type='cap'
    * @returns {Promise<CategoryResult|CapResult|null>}
    */
   const addItem = ({ type, categories = [] } = {}) => {
      if (type !== 'category' && type !== 'cap') {
         return Promise.reject(new Error(`Modal.addItem: type must be 'category' or 'cap', got '${type}'`));
      }

      return new Promise(resolve => {
         _activeResolve = resolve;

         const frag = document.createDocumentFragment();

         const titles = { category: 'New Category', cap: 'Add Cap' };
         const labels_ = { category: 'Add item', cap: 'Add item' };
         frag.appendChild(makeHeader(labels_[type], titles[type], true));

         const body = el('div', 'mdl-body mdl-body-scroll');
         const errorEl = makeError();

         if (type === 'category') {
            const { container, getData, focusFirst } = buildCategoryForm(errorEl);
            body.appendChild(container);
            body.appendChild(errorEl);
            frag.appendChild(body);

            const footer = el('div', 'mdl-footer');
            const cancelBtn = el('button', 'mdl-btn mdl-btn-ghost');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => _resolve(null));

            const addBtn = el('button', 'mdl-btn mdl-btn-primary');
            addBtn.textContent = 'Add Category';
            addBtn.addEventListener('click', () => {
               const data = getData();
               if (data) _resolve(data);
            });

            footer.appendChild(cancelBtn);
            footer.appendChild(addBtn);
            frag.appendChild(footer);

            mount(frag);
            setTimeout(focusFirst, 80);

         } else {
            // type === 'cap'
            const { container, getData } = buildCapForm(categories, _pendingImage, errorEl);
            _pendingImage = null; // consumed
            body.appendChild(container);
            body.appendChild(errorEl);
            frag.appendChild(body);

            const footer = el('div', 'mdl-footer');
            const cancelBtn = el('button', 'mdl-btn mdl-btn-ghost');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => _resolve(null));

            const addBtn = el('button', 'mdl-btn mdl-btn-primary');
            addBtn.textContent = 'Add Cap';
            addBtn.addEventListener('click', () => {
               const data = getData();
               if (data) _resolve(data);
            });

            footer.appendChild(cancelBtn);
            footer.appendChild(addBtn);
            frag.appendChild(footer);

            mount(frag);
         }
      });
   };

   /* ═══════════════════════════════════════════════════════════════════════
      PUBLIC: Modal.setPendingImage
      ═══════════════════════════════════════════════════════════════════════ */
   /**
    * Call this before Modal.addItem({ type: 'cap' }) to pre-populate
    * the image slot with a Blob/File returned by an external image module.
    *
    * @param {Blob|File} blobOrFile
    */
   const setPendingImage = (blobOrFile) => {
      _pendingImage = blobOrFile;
   };

   /* ─── Public surface ──────────────────────────────────────────────────── */
   return { confirm, addItem, setPendingImage };
})();

/* ── Optional: attach to window for plain-script usage ── */
//if (typeof window !== 'undefined') window.Modal = Modal;

export default Modal;