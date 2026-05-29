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
 *   CapResult:      { image: File|Blob|null, category: string|'__new__', tagName?: string, description: string }
 *
 * External image integration:
 *   Before opening a cap modal you can pre-load an image via:
 *     Modal.setPendingImage(blobOrFile)
 *   The modal will display a preview of it and include it in the result.
 *   If no image is pre-loaded, the user sees an upload slot instead.
 */

import * as camera from '../camera/camera.js';
import { tryHeicConversion, showLoadingScreen, updateLoadingScreen, hideLoadingScreen, cssColorToHex, isValidCssColor } from '../helpers/helper.js';
import { processCapImage } from '../data/image-processor.js';
import { showImageCropper } from './image-cropper.js';

const Modal = (() => {
   /* ─── State ──────────────────────────────────────────────────────────── */
   let _pendingImage = null;     // set from outside before opening cap modal
   let _pendingImageName = null;
   let _capColor = null;         // temporary hex color of the pending cap
   let _activeResolve = null;    // promise resolver for current modal
   let _overlay = null;          // current DOM overlay
   let _capAbortController = null; // abort controller for cap modal image processing

   /* ─── Styles ─────────────────────────────────────────────────────────── */
   const STYLE_ID = '__modal_styles__';
   const injectStyles = () => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
      /* @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Syne:wght@400;600;700;800&display=swap'); */

      /* ── Overlay ── */
      .mdl-overlay {
         position: fixed;
         inset: 0;
         z-index: 9998;
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
         from {
            opacity: 0;
         }

         to {
            opacity: 1;
         }
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
         font-variant-numeric: lining-nums;
         animation: mdl-box-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
         overflow: hidden;
      }

      @keyframes mdl-box-in {
         from {
            opacity: 0;
            transform: translateY(18px) scale(0.97);
         }

         to {
            opacity: 1;
            transform: translateY(0) scale(1);
         }
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
         border: 1.5px solid rgba(245, 242, 236, 0.3);
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
         background: rgba(245, 242, 236, 0.12);
         border-color: rgba(245, 242, 236, 0.6);
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

      .mdl-color-swatch:focus {
         outline: none;
         box-shadow: 3px 3px 0 #1a1a1a;
      }

      .mdl-color-swatch input[type="color"] {
         width: 150%;
         height: 150%;
         margin: -25%;
         border: none;
         cursor: pointer;
         opacity: 0;
         position: absolute;
      }

      .mdl-color-swatch {
         position: relative;
      }

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

      .mdl-image-slot:hover {
         border-color: #1a1a1a;
         background: #f9f7f2;
      }

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

      /* ── Camera button row ── */
      .mdl-camera-row {
         display: flex;
         gap: 0.5rem;
         margin-top: 0.5rem;
      }

      .mdl-camera-btn {
         flex: 1;
         background: #1a1a1a;
         color: #f5f2ec;
         border: 1.5px solid #1a1a1a;
         border-radius: 2px;
         padding: 0.5rem;
         font-family: 'Syne', sans-serif;
         font-size: 0.75rem;
         font-weight: 600;
         cursor: pointer;
         transition: transform 0.12s, box-shadow 0.12s;
         display: flex;
         justify-content: center;
         align-items: baseline;
         gap: 0.4rem;
      }

      .mdl-camera-btn:active {
         transform: translate(2px, 2px);
         box-shadow: none;
      }

      .mdl-camera-btn em {
         font-size: 1.2rem;
         line-height: 1.2rem;
         font-style: normal;
      }

      .mdl-camera-btn-secondary {
         background: #f5f2ec;
         color: #1a1a1a;
         border-color: #1a1a1a;
         flex: 1;
         display: flex;
      }

      .mdl-camera-btn-secondary[disabled] {
         flex: none;
         display: none;
      }

      /* ── Tag / select ── */
      .mdl-select {
         appearance: none;
         background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%231a1a1a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
         background-repeat: no-repeat;
         background-position: right 0.75rem center;
         padding-right: 2.2rem;
         cursor: pointer;
      }

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

      .mdl-error.visible {
         display: block;
      }

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

      .mdl-btn:active {
         transform: translate(2px, 2px);
         box-shadow: none !important;
      }

      .mdl-btn-ghost {
         background: transparent;
         border-color: #bbb;
         color: #555;
      }

      .mdl-btn-ghost:hover {
         border-color: #1a1a1a;
         color: #1a1a1a;
      }

      .mdl-btn-danger {
         background: #fff0ee;
         border-color: var(--clr-primary);
         color: var(--clr-primary);
         box-shadow: 3px 3px 0 var(--clr-primary);
      }

      .mdl-btn-danger:hover {
         background: var(--clr-primary);
         color: #fff;
      }

      .mdl-btn-primary {
         background: #1a1a1a;
         border-color: #1a1a1a;
         color: #f5f2ec;
      }

      .mdl-btn-primary:hover {
         background: #333;
      }
      
      mdl-btn-important {
         box-shadow: 3px 3px 0 rgba(26, 26, 26, 0.25);
      }

      .mdl-btn-important:hover {
         box-shadow: 4px 4px 0 rgba(26, 26, 26, 0.3);
      }

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

      /* ── Dark mode overrides for Modal ── */
      [data-theme$="-dark"] .mdl-overlay {
         background: rgba(0, 0, 0, 0.1);
         backdrop-filter: blur(8px);
         -webkit-backdrop-filter: blur(8px);
      }

      [data-theme$="-dark"] .mdl-box {
         background: #1e1e20;
         color: #a9a9a9;
         border-color: #a9a9a9;
         box-shadow: 6px 6px 0 #555;
      }

      [data-theme$="-dark"] .mdl-header {
         border-bottom-color: #a9a9a9;
         background: #a9a9a9;
         color: #1e1e20;
      }

      [data-theme$="-dark"] .mdl-close {
         border-color: rgba(30, 30, 32, 0.3);
         color: #1e1e20;
      }

      [data-theme$="-dark"] .mdl-close:hover {
         background: rgba(30, 30, 32, 0.12);
         border-color: rgba(30, 30, 32, 0.6);
      }

      [data-theme$="-dark"] .mdl-question {
         color: #a9a9a9;
      }

      [data-theme$="-dark"] .mdl-label {
         color: #a8a8b2;
      }

      [data-theme$="-dark"] .mdl-label span.mdl-required {
         color: #ff6b5c;
      }

      [data-theme$="-dark"] .mdl-input,
      [data-theme$="-dark"] .mdl-textarea,
      [data-theme$="-dark"] .mdl-select {
         background: #2c2c30;
         border-color: #555;
         color: #a9a9a9;
      }

      [data-theme$="-dark"] .mdl-input:focus,
      [data-theme$="-dark"] .mdl-textarea:focus,
      [data-theme$="-dark"] .mdl-select:focus {
         border-color: #a9a9a9;
         box-shadow: 3px 3px 0 #a9a9a9;
      }

      [data-theme$="-dark"] .mdl-color-swatch {
         border-color: #555;
      }

      [data-theme$="-dark"] .mdl-color-swatch:focus {
         box-shadow: 3px 3px 0 #a9a9a9;
      }

      [data-theme$="-dark"] .mdl-input.mdl-hex {
         background: #2c2c30;
      }

      [data-theme$="-dark"] .mdl-image-slot {
         border-color: #555;
         background: #2c2c30;
      }

      [data-theme$="-dark"] .mdl-image-slot:hover {
         border-color: #a9a9a9;
         background: #35353a;
      }

      [data-theme$="-dark"] .mdl-image-slot-hint {
         color: #888;
      }

      [data-theme$="-dark"] .mdl-camera-btn {
         background: #a9a9a9;
         color: #1e1e20;
         border-color: #a9a9a9;
      }

      [data-theme$="-dark"] .mdl-camera-btn-secondary {
         background: #2c2c30;
         color: #a9a9a9;
         border-color: #a9a9a9;
      }

      [data-theme$="-dark"] .mdl-new-category-inline {
         border-color: #555;
         background: #2c2c30;
      }

      [data-theme$="-dark"] .mdl-new-category-inline .mdl-label {
         color: #a8a8b2;
      }

      [data-theme$="-dark"] .mdl-error {
         color: #ff6b5c;
         background: #2c1a18;
         border-color: #ff6b5c;
      }

      [data-theme$="-dark"] .mdl-footer {
         border-top-color: #3a3a40;
      }

      [data-theme$="-dark"] .mdl-btn-ghost {
         border-color: #777;
         color: #a8a8b2;
      }

      [data-theme$="-dark"] .mdl-btn-ghost:hover {
         border-color: #a9a9a9;
         color: #a9a9a9;
      }

      [data-theme$="-dark"] .mdl-btn-danger {
         background: #1e1e20;
         border-color: var(--clr-primary);
         color: var(--clr-primary);
         box-shadow: 3px 3px 0 var(--clr-primary);
      }

      [data-theme$="-dark"] .mdl-btn-danger:hover {
         background: var(--clr-primary);
         color: #1e1e20;
      }

      [data-theme$="-dark"] .mdl-btn-primary {
         background: #a9a9a9;
         border-color: #a9a9a9;
         color: #1e1e20;
      }

      [data-theme$="-dark"] .mdl-btn-primary:hover {
         background: #fff;
      }

      [data-theme$="-dark"] .mdl-btn-important {
         box-shadow: 3px 3px 0 rgba(232, 232, 237, 0.25);
      }

      [data-theme$="-dark"] .mdl-btn-important:hover {
         box-shadow: 4px 4px 0 rgba(232, 232, 237, 0.3);
      }

      [data-theme$="-dark"] .mdl-sep {
         border-top-color: #3a3a40;
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
      //close(); // close any existing modal first
      injectStyles();

      _overlay = el('div', 'mdl-overlay');
      const box = el('div', 'mdl-box');
      box.appendChild(boxContent);
      _overlay.appendChild(box);

      // Click outside → cancel
      /* _overlay.addEventListener('click', e => {
         if (e.target === _overlay) _resolve(null);
      }); */
      _overlay.addEventListener('mouseup', e => {
         if (e.target === _overlay && window.getSelection().toString() === '') {
            _resolve(null);
         }
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
      // Abort any ongoing image processing if cap modal was open
      if (_capAbortController) {
         _capAbortController.abort();
         _capAbortController = null;
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
   const confirm = ({ question, yesLabel = 'Yes', noLabel = null, headerText = null } = {}) => {
      return new Promise(resolve => {
         _activeResolve = resolve;

         const frag = document.createDocumentFragment();

         frag.appendChild(makeHeader('Confirmation', headerText ? headerText : 'Are you sure?', true));

         const body = el('div', 'mdl-body');
         const q = el('div', 'mdl-question');
         q.textContent = question || 'Do you want to proceed?';
         body.appendChild(q);
         frag.appendChild(body);

         const footer = el('div', 'mdl-footer');

         const yesBtn = el('button', 'mdl-btn mdl-btn-danger');
         yesBtn.textContent = yesLabel;
         yesBtn.addEventListener('click', () => _resolve(true));

         let noBtn = null;
         if (noLabel) {
            noBtn = el('button', 'mdl-btn mdl-btn-ghost');
            noBtn.textContent = noLabel;
            noBtn.addEventListener('click', () => _resolve(false));
            footer.appendChild(noBtn);
         }

         footer.appendChild(yesBtn);
         frag.appendChild(footer);

         const box = mount(frag);

         // Add keyboard shortcuts for confirmation dialogs
         const keyHandler = (e) => {
            if (e.key === 'Enter') {
               e.preventDefault();
               yesBtn.click();
            } else if (e.key === 'Escape' && noBtn) {
               e.preventDefault();
               noBtn.click();
            }
         };

         document.addEventListener('keydown', keyHandler);
         const originalOnKey = _overlay._onKey;
         _overlay._onKey = (e) => {
            keyHandler(e);
            if (e.key !== 'Escape') originalOnKey(e);
         };
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

      nameInput.oninput = () => {
         const title = nameInput.value.trim();
         if (isValidCssColor(title)) {
            const hex = cssColorToHex(title);
            syncColor(hex);
         }
      };

      container.appendChild(field(label('Category name', true), nameInput));

      // Color
      let currentColor = '#808080';
      const colorField = el('div', 'mdl-field');
      colorField.appendChild(label('Accent color'));

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
      //hexInput.placeholder = '#3B82F6';
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
         if (name.toLowerCase() === 'all') { errorEl.show('Category name "all" can\'t be used'); nameInput.focus(); return null; }
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
    * @param {AbortSignal} signal                    cancellation signal from parent modal
    */
   const buildCapForm = async (categories, pendingImage, errorEl, signal) => {
      const container = document.createDocumentFragment();
      let imageFile = pendingImage || null;
      let isProcessing = false;
      let originalImage = null;
      let originalFile = null;

      /* ── Image slot ── */
      const imageField = el('div', 'mdl-field');
      imageField.appendChild(label('Cap image', true));

      const imageSlot = el('div', 'mdl-image-slot');
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.setAttribute('aria-label', 'Upload cap image');

      const imgPreview = el('img');
      imgPreview.alt = 'Cap preview';
      imgPreview.style.display = 'none';

      const slotIcon = el('div', 'mdl-image-icon');
      slotIcon.textContent = '🖼️';
      const slotHint = el('div', 'mdl-image-slot-hint');
      slotHint.textContent = 'Click to upload or drag an image';

      imageSlot.appendChild(fileInput);
      imageSlot.appendChild(imgPreview);
      imageSlot.appendChild(slotIcon);
      imageSlot.appendChild(slotHint);
      imageField.appendChild(imageSlot);

      /* ── Camera and crop button row ── */
      const cameraRow = el('div', 'mdl-camera-row');
      const cameraBtn = el('button', 'mdl-camera-btn');
      cameraBtn.innerHTML = '<em>📸</em> Take Photo';

      const cropBtn = el('button', 'mdl-camera-btn mdl-camera-btn-secondary');
      cropBtn.innerHTML = '<em>✂️</em> Crop Original';
      cropBtn.disabled = true;
      cropBtn.style.opacity = '0.5';

      cameraRow.appendChild(cropBtn);
      cameraRow.appendChild(cameraBtn);
      imageField.appendChild(cameraRow);

      container.appendChild(imageField);

      const showImagePreview = async (src) => {
         imgPreview.src = src;
         imgPreview.style.display = 'block';
         slotIcon.style.display = 'none';
         slotHint.style.display = 'none';
         // Enable crop button when image is loaded
         cropBtn.disabled = false;
         cropBtn.style.opacity = '1';
      };

      const hideImagePreview = () => {
         imgPreview.src = '';
         imgPreview.style.display = 'none';
         slotIcon.style.display = 'block';
         slotHint.style.display = 'block';
         // Disable crop button when no image
         cropBtn.disabled = true;
         cropBtn.style.opacity = '0.5';
      };

      const titleInput = el('input', 'mdl-input');

      // Process image and show preview
      const processAndPreviewImage = async (file) => {
         if (!file) return;

         showLoadingScreen('Processing image...');
         isProcessing = true;

         titleInput.value = _pendingImageName ? _pendingImageName : (file.name ? file.name : String(Date.now()));

         let convertedImage = null;
         try {
            // Check if already aborted before starting
            if (signal.aborted) {
               throw new DOMException('Image processing cancelled', 'AbortError');
            }

            updateLoadingScreen('Converting image format if needed...');
            convertedImage = await tryHeicConversion(file);

            if (!originalImage || originalFile !== file) {
               originalImage = convertedImage;
               originalFile = file
            }

            updateLoadingScreen(`Detecting bottle cap in image '${titleInput.value}'...`);
            const processed = await processCapImage(convertedImage, signal);

            updateLoadingScreen('Preparing preview...');
            imageFile = processed.imageBlob;
            _capColor = processed.capColor;

            // Show the processed image preview
            const processedBlobUrl = URL.createObjectURL(processed.imageBlob);
            await showImagePreview(processedBlobUrl);

            updateLoadingScreen('Image ready!');
            errorEl.hide();
         } catch (error) {
            // Handle abort errors silently (user cancelled)
            if (error.name === 'AbortError' || signal.aborted) {
               console.log('Image processing cancelled by user');
               isProcessing = false;
               _pendingImageName = null;
               hideLoadingScreen();
               return;
            }
            updateLoadingScreen('FAILED to process the image, using the original one...');
            console.error('Image processing error:', error);
            errorEl.show('Failed to process image. Using original.');
            imageFile = convertedImage ? convertedImage : file;
            _capColor = null;
            showImagePreview(URL.createObjectURL(imageFile));
         } finally {
            isProcessing = false;
            _pendingImageName = null;
            if (!originalImage) {
               originalImage = imageFile;
               originalFile = file
            }
            hideLoadingScreen();
         }
      };

      // If a pending image was pre-loaded, process it
      if (pendingImage) {
         await processAndPreviewImage(pendingImage);
      }

      // Handle camera capture
      cameraBtn.addEventListener('click', async () => {
         if (isProcessing) return;
         try {
            const capturedBlob = await camera.showCameraModal();
            if (capturedBlob) {
               await processAndPreviewImage(capturedBlob);
            }
         } catch (error) {
            console.error('Camera error:', error);
            errorEl.show('Could not access camera. Please check permissions.');
         }
      });

      // Handle crop original image
      cropBtn.addEventListener('click', async () => {
         if (isProcessing || !originalImage) return;
         try {
            showLoadingScreen('Opening image cropper...');
            const croppedBlob = await showImageCropper(URL.createObjectURL(originalImage));
            if (!croppedBlob) {
               hideLoadingScreen();
               return;
            }
            updateLoadingScreen('Processing cropped image...');
            imageFile = croppedBlob;
            const croppedBlobUrl = URL.createObjectURL(croppedBlob);
            await showImagePreview(croppedBlobUrl);
            hideLoadingScreen();
         } catch (error) {
            hideLoadingScreen();
            console.error('Error cropping image:', error);
            errorEl.show('Failed to crop image.');
         }
      });

      fileInput.addEventListener('change', async () => {
         if (isProcessing) return;
         const f = fileInput.files[0];
         if (f) {
            await processAndPreviewImage(f);
         }
      });

      // Drag & drop
      imageSlot.addEventListener('dragover', e => { e.preventDefault(); imageSlot.style.borderColor = '#1a1a1a'; });
      imageSlot.addEventListener('dragleave', () => { imageSlot.style.borderColor = ''; });
      imageSlot.addEventListener('drop', async (e) => {
         if (isProcessing) return;
         e.preventDefault();
         imageSlot.style.borderColor = '';
         const f = e.dataTransfer.files[0];
         if (f && f.type.startsWith('image/')) {
            await processAndPreviewImage(f);
         }
      });

      container.appendChild(el('hr', 'mdl-sep'));

      /* ── Cap title ── */
      const titleField = el('div', 'mdl-field');
      titleField.appendChild(label('Cap title', false));
      titleInput.type = 'text';
      titleInput.placeholder = 'Enter cap name';
      titleInput.maxLength = 100;
      titleField.appendChild(titleInput);
      container.appendChild(titleField);

      // Auto-populate title from filename if image is selected
      fileInput.addEventListener('change', () => {
         const f = fileInput.files[0];
         if (f && !titleInput.value) {
            // Use filename without extension as default title
            titleInput.value = f.name.replace(/\.[^/.]+$/, '');
         }
      });

      container.appendChild(el('hr', 'mdl-sep'));

      /* ── Tag / category select ── */
      const tagField = el('div', 'mdl-field');
      tagField.appendChild(label('Category tag', false));

      const tagSelect = el('select', 'mdl-select');
      //tagSelect.addAttribute('name', 'Category');

      const placeholderOpt = el('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = '— Select a category — (optional)';
      placeholderOpt.disabled = true;
      placeholderOpt.selected = true;
      tagSelect.appendChild(placeholderOpt);

      // Filter out 'all' category - only show user-defined categories
      (categories || []).filter(cat => cat.id !== 'all').forEach(cat => {
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
         // Validate image is present
         if (!imageFile) {
            errorEl.show('Cap image is required. Please upload or take a photo.');
            fileInput.focus();
            return null;
         }

         const tagVal = tagSelect.value;
         // Allow empty tag selection - will default to 'all' in caps.js

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
            capColor: _capColor || '#808080',
            imageProcessed: _capColor ? true : false,
            title: titleInput.value.trim(),
            category: tagVal || 'all', // Default to 'all' if not selected
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
   const addItem = ({ type, categories = [], headerText = null, hideBatchButton = false } = {}) => {
      if (type !== 'category' && type !== 'cap') {
         return Promise.reject(new Error(`Modal.addItem: type must be 'category' or 'cap', got '${type}'`));
      }

      return new Promise(async (resolve) => {
         _activeResolve = resolve;

         const frag = document.createDocumentFragment();

         const titles = { category: 'New Category', cap: 'Add Cap' };
         const labels_ = { category: 'Add item', cap: 'Add item' };
         const header = makeHeader(labels_[type], headerText ? headerText : titles[type], true);
         frag.appendChild(header);

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

            const addBtn = el('button', 'mdl-btn mdl-btn-primary mdl-btn-important');
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
            // Create abort controller for this modal to cancel image processing if user closes
            const capAbortController = new AbortController();
            _capAbortController = capAbortController; // Store globally so close() can abort it

            const { container, getData } = await buildCapForm(categories, _pendingImage, errorEl, capAbortController.signal);
            _pendingImage = null; // consumed
            body.appendChild(errorEl);
            body.appendChild(container);
            frag.appendChild(body);

            // Modify header's close button to abort the controller
            const closeBtn = header.querySelector('.mdl-close');
            if (closeBtn) {
               // Remove the existing click listener and add one that aborts
               const newCloseBtn = closeBtn.cloneNode(true);
               closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
               newCloseBtn.addEventListener('click', () => {
                  capAbortController.abort();
                  _resolve(null);
               });
            }

            const footer = el('div', 'mdl-footer');
            const cancelBtn = el('button', 'mdl-btn mdl-btn-ghost');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => {
               capAbortController.abort();
               _resolve(null);
            });

            const addBtn = el('button', 'mdl-btn mdl-btn-primary mdl-btn-important');
            addBtn.textContent = 'Add Cap';
            addBtn.addEventListener('click', () => {
               capAbortController.abort(); // Cancel any ongoing processing when submitting
               const data = getData();
               if (data) _resolve(data);
            });

            if (!hideBatchButton) {
               // Add Multiple Caps button
               const addMultipleBtn = el('button', 'mdl-btn mdl-btn-ghost mdl-btn-important');
               addMultipleBtn.textContent = 'Batch add';
               addMultipleBtn.addEventListener('click', () => {
                  // Open file picker for multiple files
                  const multiFileInput = el('input');
                  multiFileInput.type = 'file';
                  multiFileInput.multiple = true;
                  multiFileInput.accept = 'image/*';

                  multiFileInput.addEventListener('change', () => {
                     const files = Array.from(multiFileInput.files);
                     if (files.length > 0) {
                        _resolve({
                           isMultiple: true,
                           files: files,
                           image: null,
                           description: '',
                        });
                     }
                  });

                  multiFileInput.click();
               });

               footer.appendChild(addMultipleBtn);
               footer.appendChild(el('hr', ''));
            }
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
   const setPendingImage = async (blobOrFile) => {
      showLoadingScreen('Processing image...');
      let convertedImage = null;
      _pendingImageName = blobOrFile.name ? blobOrFile.name : String(Date.now());

      /* try {
         updateLoadingScreen('Converting format to WebP...');
         convertedImage = await tryHeicConversion(blobOrFile);

         updateLoadingScreen(`Detecting bottle cap in image '${_pendingImageName}'...`);
         const processed = await processCapImage(convertedImage);

         updateLoadingScreen('Preparing preview...');
         _pendingImage = processed.imageBlob;
         _capColor = processed.capColor;
      } catch (error) {
         updateLoadingScreen('FAILED to process the image, using the original one...');
         console.error('Image processing error:', error);
         errorEl.show('Failed to process image. Using original.');
         imageFile = convertedImage ? convertedImage : blobOrFile;
         _pendingImage = imageFile;
         _capColor = null;
      } */
      _pendingImage = blobOrFile;
      _capColor = null;
   };

   /* ═══════════════════════════════════════════════════════════════════════
      PUBLIC: Modal.getPassphrase
      ═══════════════════════════════════════════════════════════════════════ */
   /**
    * Prompt user for encryption passphrase
    * @param {string} title
    * @param {string} label
    * @returns {Promise<string|null>}
    */
   const getPassphrase = (title = 'Enter Passphrase', label = 'Encryption passphrase') => {
      return new Promise(resolve => {
         _activeResolve = resolve;
         const frag = document.createDocumentFragment();

         frag.appendChild(makeHeader('Encryption', title, true));

         const body = el('div', 'mdl-body');

         const field = el('div', 'mdl-field');
         const labelEl = el('label', 'mdl-label');
         labelEl.innerHTML = `${label} <span class="mdl-required">*</span>`;

         const input = el('input', 'mdl-input');
         input.type = 'password';
         input.placeholder = 'At least 8 characters';
         input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
               const val = input.value.trim();
               if (val.length < 8) {
                  alert('Passphrase must be at least 8 characters');
               } else {
                  _resolve(val);
               }
            }
         });

         field.appendChild(labelEl);
         field.appendChild(input);
         body.appendChild(field);
         frag.appendChild(body);

         const footer = el('div', 'mdl-footer');
         const cancelBtn = el('button', 'mdl-btn mdl-btn-ghost');
         cancelBtn.textContent = 'Cancel';
         cancelBtn.addEventListener('click', () => _resolve(null));

         const confirmBtn = el('button', 'mdl-btn mdl-btn-primary mdl-btn-important');
         confirmBtn.textContent = 'Set Passphrase';
         confirmBtn.addEventListener('click', () => {
            const val = input.value.trim();
            if (val.length < 8) {
               alert('Passphrase must be at least 8 characters');
            } else {
               _resolve(val);
            }
         });

         footer.appendChild(cancelBtn);
         footer.appendChild(confirmBtn);
         frag.appendChild(footer);

         mount(frag);
         setTimeout(() => input.focus(), 80);
      });
   };

   /* ─── Public surface ──────────────────────────────────────────────────── */
   return { confirm, addItem, setPendingImage, getPassphrase };
})();

/* ── Optional: attach to window for plain-script usage ── */
//if (typeof window !== 'undefined') window.Modal = Modal;

export default Modal;