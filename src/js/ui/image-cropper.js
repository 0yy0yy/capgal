/**
 * Image Cropper Modal
 * Allows users to crop images to a square of their choice
 * @param {string} imageSrc - Image source URL (can be blob URL or data URL)
 */

export async function showImageCropper(imageSrc) {
   return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.id = 'cropper-overlay';
      overlay.style.cssText = `
         position: fixed;
         inset: 0;
         z-index: 9999;
         background: rgba(10, 10, 12, 0.9);
         backdrop-filter: blur(6px);
         -webkit-backdrop-filter: blur(6px);
         display: flex;
         align-items: center;
         justify-content: center;
         padding: 1rem;
         animation: fade-in 0.2s ease;
      `;

      // Create container
      const container = document.createElement('div');
      container.style.cssText = `
         background: #f5f2ec;
         color: #1a1a1a;
         border: 1.5px solid #1a1a1a;
         border-radius: 2px;
         box-shadow: 6px 6px 0 #1a1a1a;
         width: 100%;
         max-width: 600px;
         max-height: 90vh;
         display: flex;
         flex-direction: column;
         overflow: hidden;
         font-family: 'Syne', sans-serif;
         animation: slide-up 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
      `;

      // Add animation styles
      const style = document.createElement('style');
      style.textContent = `
         @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
         }
         @keyframes slide-up {
            from {
               opacity: 0;
               transform: translateY(18px) scale(0.97);
            }
            to {
               opacity: 1;
               transform: translateY(0) scale(1);
            }
         }
      `;
      document.head.appendChild(style);

      // Header
      const header = document.createElement('div');
      header.style.cssText = `
         padding: 1rem 1.25rem;
         border-bottom: 1px solid #1a1a1a;
         display: flex;
         justify-content: space-between;
         align-items: center;
      `;
      header.innerHTML = `
         <h2 style="margin: 0; font-size: 1.2rem;">Crop Image</h2>
         <button type="button" style="
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            width: 2rem;
            height: 2rem;
            display: flex;
            align-items: center;
            justify-content: center;
         ">✕</button>
      `;

      const closeBtn = header.querySelector('button');

      // Content area
      const content = document.createElement('div');
      content.style.cssText = `
         flex: 1;
         display: flex;
         flex-direction: column;
         gap: 1rem;
         padding: 1rem;
         overflow-y: auto;
         max-height: calc(90vh - 120px);
      `;

      // Canvas container
      const canvasContainer = document.createElement('div');
      canvasContainer.style.cssText = `
         position: relative;
         width: 90%;
         align-self: center;
         aspect-ratio: auto;
         background: #ddd;
         border: 1px solid #999;
         overflow: hidden;
         cursor: grab;
      `;
      canvasContainer.addEventListener('mousedown', () => {
         canvasContainer.style.cursor = 'grabbing';
      });
      canvasContainer.addEventListener('mouseup', () => {
         canvasContainer.style.cursor = 'grab';
      });

      // Canvas
      const canvas = document.createElement('canvas');
      canvas.style.cssText = `
         display: block;
      `;
      canvasContainer.appendChild(canvas);

      // Crop frame (square)
      const cropFrame = document.createElement('div');
      cropFrame.style.cssText = `
         position: absolute;
         border: 2px dashed #fff;
         box-shadow: 0 0 0 2px #1a1a1a;
         cursor: move;
         background: rgba(255, 255, 255, 0.1);
         /* mix-blend-mode: plus-lighter; */
      `;
      canvasContainer.appendChild(cropFrame);

      // Resize handles
      const handles = {};
      const handlePositions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      handlePositions.forEach(pos => {
         const handle = document.createElement('div');
         handle.style.cssText = `
            position: absolute;
            width: 12px;
            height: 12px;
            background: #fff;
            border: 2px solid #1a1a1a;
            border-radius: 50%;
            cursor: ${getCursorForHandle(pos)};
            transform: translate(-50%, -50%);
         `;
         cropFrame.appendChild(handle);
         handles[pos] = handle;
      });

      content.appendChild(canvasContainer);

      // Size info
      const sizeInfo = document.createElement('div');
      sizeInfo.style.cssText = `
         text-align: center;
         font-size: 0.9rem;
         color: #666;
      `;
      content.appendChild(sizeInfo);

      // Buttons
      const buttons = document.createElement('div');
      buttons.style.cssText = `
         display: flex;
         gap: 0.75rem;
         padding: 1rem;
         border-top: 1px solid #1a1a1a;
         background: #f5f2ec;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
         flex: 1;
         padding: 0.75rem;
         border: 1.5px solid #1a1a1a;
         background: white;
         color: #1a1a1a;
         border-radius: 2px;
         cursor: pointer;
         font-family: 'Syne', sans-serif;
         font-weight: 600;
      `;

      const cropBtn = document.createElement('button');
      cropBtn.textContent = 'Crop';
      cropBtn.style.cssText = `
         flex: 1;
         padding: 0.75rem;
         border: 1.5px solid #1a1a1a;
         background: #1a1a1a;
         color: #f5f2ec;
         border-radius: 2px;
         cursor: pointer;
         font-family: 'Syne', sans-serif;
         font-weight: 600;
      `;

      buttons.appendChild(cancelBtn);
      buttons.appendChild(cropBtn);

      container.appendChild(header);
      container.appendChild(content);
      container.appendChild(buttons);
      overlay.appendChild(container);
      document.body.appendChild(overlay);

      // Load image
      const img = new Image();

      let cropX = 0;
      let cropY = 0;
      let cropSize = 0;

      img.onload = () => {
         canvas.width = img.width;
         canvas.height = img.height;

         canvas.style.width = '100%';
         canvas.style.height = '100%';

         const ctx = canvas.getContext('2d');
         ctx.drawImage(img, 0, 0);

         // Always read the live display scale from the rendered canvas size.
         // The old code captured scale once at load time from the container rect,
         // which didn't match the canvas's actual CSS 100% sizing — causing the
         // crop frame to map to only ~1/4 of the visible image area.
         const getScale = () => canvas.getBoundingClientRect().width / img.width;

         // Initialise crop frame centred at 70% of the shorter dimension
         cropSize = Math.min(img.width, img.height) * 0.7;
         cropX = (img.width - cropSize) / 2;
         cropY = (img.height - cropSize) / 2;

         let isDragging = false;
         let dragType = null;

         let dragStartMouseX = 0;
         let dragStartMouseY = 0;
         let dragStartCropX = 0;
         let dragStartCropY = 0;
         let dragStartCropSize = 0;

         const updateCropFrameDisplay = () => {
            const scale = getScale();
            const rect = canvasContainer.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();

            cropFrame.style.left = (canvasRect.left - rect.left + cropX * scale) + 'px';
            cropFrame.style.top = (canvasRect.top - rect.top + cropY * scale) + 'px';
            cropFrame.style.width = cropSize * scale + 'px';
            cropFrame.style.height = cropSize * scale + 'px';

            const frameW = cropSize * scale;
            const frameH = cropSize * scale;

            handles['nw'].style.left = '-3px';
            handles['nw'].style.top = '-3px';
            handles['n'].style.left = (frameW / 2 - 3) + 'px';
            handles['n'].style.top = '-3px';
            handles['ne'].style.left = (frameW - 3) + 'px';
            handles['ne'].style.top = '-3px';
            handles['e'].style.left = (frameW - 3) + 'px';
            handles['e'].style.top = (frameH / 2 - 3) + 'px';
            handles['se'].style.left = (frameW - 3) + 'px';
            handles['se'].style.top = (frameH - 3) + 'px';
            handles['s'].style.left = (frameW / 2 - 3) + 'px';
            handles['s'].style.top = (frameH - 3) + 'px';
            handles['sw'].style.left = '-3px';
            handles['sw'].style.top = (frameH - 3) + 'px';
            handles['w'].style.left = '-3px';
            handles['w'].style.top = (frameH / 2 - 3) + 'px';

            sizeInfo.textContent = `Size: ${Math.round(cropSize)}px × ${Math.round(cropSize)}px`;
         };

         updateCropFrameDisplay();

         const snapshotDragStart = (clientX, clientY) => {
            dragStartMouseX = clientX;
            dragStartMouseY = clientY;
            dragStartCropX = cropX;
            dragStartCropY = cropY;
            dragStartCropSize = cropSize;
         };

         // Shared logic for both mouse and touch move — keeps handlers DRY
         const applyDrag = (clientX, clientY) => {
            const scale = getScale();
            const deltaX = (clientX - dragStartMouseX) / scale;
            const deltaY = (clientY - dragStartMouseY) / scale;

            if (dragType === 'move') {
               cropX = Math.max(0, Math.min(dragStartCropX + deltaX, img.width - cropSize));
               cropY = Math.max(0, Math.min(dragStartCropY + deltaY, img.height - cropSize));
               updateCropFrameDisplay();
               return;
            }

            // Precompute anchored edges from the drag-start snapshot
            const startRight = dragStartCropX + dragStartCropSize;
            const startBottom = dragStartCropY + dragStartCropSize;
            const startCenterX = dragStartCropX + dragStartCropSize / 2;
            const startCenterY = dragStartCropY + dragStartCropSize / 2;

            let newCropX, newCropY, newCropSize;

            switch (dragType) {

               // ── Corner handles ──────────────────────────────────────────────────────
               // Project mouse movement onto the handle's diagonal to get one clean
               // size delta; the diagonally opposite corner is the fixed anchor.

               case 'se':
                  // Anchor: nw = (dragStartCropX, dragStartCropY)
                  newCropSize = dragStartCropSize + (deltaX + deltaY) / 2;
                  newCropX = dragStartCropX;
                  newCropY = dragStartCropY;
                  break;

               case 'nw':
                  // Anchor: se = (startRight, startBottom)
                  newCropSize = dragStartCropSize - (deltaX + deltaY) / 2;
                  newCropX = startRight - newCropSize;
                  newCropY = startBottom - newCropSize;
                  break;

               case 'ne':
                  // Anchor: sw = (dragStartCropX, startBottom)
                  newCropSize = dragStartCropSize + (deltaX - deltaY) / 2;
                  newCropX = dragStartCropX;          // sw x is fixed (left edge)
                  newCropY = startBottom - newCropSize; // sw y is fixed (bottom edge)
                  break;

               case 'sw':
                  // Anchor: ne = (startRight, dragStartCropY)
                  newCropSize = dragStartCropSize + (-deltaX + deltaY) / 2;
                  newCropX = startRight - newCropSize; // ne x is fixed (right edge)
                  newCropY = dragStartCropY;           // ne y is fixed (top edge)
                  break;

               // ── Edge handles ────────────────────────────────────────────────────────
               // Only one axis drives size; the opposite edge stays planted.
               // The perpendicular axis stays centered so the square doesn't drift.

               case 'e':
                  // Anchor: left edge (dragStartCropX fixed)
                  newCropSize = dragStartCropSize + deltaX;
                  newCropX = dragStartCropX;
                  newCropY = startCenterY - newCropSize / 2;
                  break;

               case 'w':
                  // Anchor: right edge (startRight fixed)
                  newCropSize = dragStartCropSize - deltaX;
                  newCropX = startRight - newCropSize;
                  newCropY = startCenterY - newCropSize / 2;
                  break;

               case 's':
                  // Anchor: top edge (dragStartCropY fixed)
                  newCropSize = dragStartCropSize + deltaY;
                  newCropX = startCenterX - newCropSize / 2;
                  newCropY = dragStartCropY;
                  break;

               case 'n':
                  // Anchor: bottom edge (startBottom fixed)
                  newCropSize = dragStartCropSize - deltaY;
                  newCropX = startCenterX - newCropSize / 2;
                  newCropY = startBottom - newCropSize;
                  break;
            }

            // Clamp size and position within image bounds
            newCropSize = Math.max(50, Math.min(newCropSize, img.width, img.height));
            newCropX = Math.max(0, Math.min(newCropX, img.width - newCropSize));
            newCropY = Math.max(0, Math.min(newCropY, img.height - newCropSize));

            cropX = newCropX;
            cropY = newCropY;
            cropSize = newCropSize;

            updateCropFrameDisplay();
         };

         // ── Mouse ─────────────────────────────────────────────────────────────

         cropFrame.addEventListener('mousedown', (e) => {
            if (e.target === cropFrame) {
               isDragging = true;
               dragType = 'move';
               snapshotDragStart(e.clientX, e.clientY);
               e.preventDefault();
            }
         });

         Object.keys(handles).forEach(pos => {
            handles[pos].addEventListener('mousedown', (e) => {
               isDragging = true;
               dragType = pos;
               snapshotDragStart(e.clientX, e.clientY);
               e.preventDefault();
            });
         });

         document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            applyDrag(e.clientX, e.clientY);
         });

         document.addEventListener('mouseup', () => {
            isDragging = false;
            dragType = null;
         });

         // ── Touch ─────────────────────────────────────────────────────────────

         // Crop frame body — move
         cropFrame.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && e.target === cropFrame) {
               isDragging = true;
               dragType = 'move';
               snapshotDragStart(e.touches[0].clientX, e.touches[0].clientY);
               e.preventDefault();
            }
         }, { passive: false });

         // Each handle — resize (same as mouse)
         Object.keys(handles).forEach(pos => {
            handles[pos].addEventListener('touchstart', (e) => {
               if (e.touches.length === 1) {
                  isDragging = true;
                  dragType = pos;
                  snapshotDragStart(e.touches[0].clientX, e.touches[0].clientY);
                  e.preventDefault();
               }
            }, { passive: false });
         });

         document.addEventListener('touchmove', (e) => {
            if (!isDragging || !e.touches[0]) return;
            applyDrag(e.touches[0].clientX, e.touches[0].clientY);
            e.preventDefault(); // prevent page scroll while cropping
         }, { passive: false });

         document.addEventListener('touchend', () => {
            isDragging = false;
            dragType = null;
         });
      };
      img.src = imageSrc;

      // ── Button events ─────────────────────────────────────────────────────────

      closeBtn.addEventListener('click', () => {
         overlay.remove();
         style.remove();
         resolve(null);
      });

      cancelBtn.addEventListener('click', () => {
         overlay.remove();
         style.remove();
         resolve(null);
      });

      cropBtn.addEventListener('click', () => {
         const croppedCanvas = document.createElement('canvas');
         croppedCanvas.width = cropSize;
         croppedCanvas.height = cropSize;

         const ctx = croppedCanvas.getContext('2d');
         ctx.drawImage(canvas, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);

         croppedCanvas.toBlob((blob) => {
            overlay.remove();
            style.remove();
            resolve(blob);
         }, 'image/webp', 1);
      });
   });
}

function getCursorForHandle(pos) {
   const cursors = {
      'nw': 'nw-resize',
      'n': 'n-resize',
      'ne': 'ne-resize',
      'e': 'e-resize',
      'se': 'se-resize',
      's': 's-resize',
      'sw': 'sw-resize',
      'w': 'w-resize',
   };
   return cursors[pos] || 'auto';
}