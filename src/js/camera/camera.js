// ── Camera capture functionality ───────────────────────────────────────────

/**
 * Show camera modal for taking photos
 */
export async function showCameraModal() {
   injectCameraStyles();
   return new Promise(async (resolve, reject) => {
      // Create a hidden video element
      const video = document.createElement('video');
      video.playsInline = true;
      video.autoplay = true;

      // Create modal overlay
      const modal = document.createElement('div');
      modal.style.cssText = `
         position: fixed;
         top: 0;
         left: 0;
         right: 0;
         bottom: 0;
         background: black;
         z-index: 10000;
         display: flex;
         flex-direction: column;
         align-items: center;
         justify-content: center;
      `;

      // Add video element
      video.style.cssText = `
         width: 100%;
         height: 100%;
         object-fit: cover;
      `;
      modal.appendChild(video);

      // Button container
      const buttons = document.createElement('div');
      buttons.style.cssText = `
         position: absolute;
         bottom: 20px;
         left: 0;
         right: 0;
         display: flex;
         justify-content: center;
         gap: 12px;
         padding: 0 16px;
      `;

      // Capture button
      const captureBtn = document.createElement('button');
      //captureBtn.textContent = '📸 Take Photo';
      captureBtn.style.cssText = `
         padding: 6px;
         font-size: 16px;
         width: 52px;
         height: 52px;
         background: transparent;
         color: white;
         border: 2px solid #4CAF50;
         box-shadow: inset 0 0 15px 0px #4CAF50;
         border-radius: 50%;
         cursor: pointer;
         font-weight: bold;
      `;

      // Flash button
      const lightBtn = document.createElement('button');
      lightBtn.classList.add('off')
      lightBtn.style.cssText = `
         position: absolute;
         top: 20px;
         left: 20px;
         width: 48px;
         height: 48px;
         border: none;
         border-color: transparent;
         cursor: pointer;
         background-repeat: no-repeat;
         background-position: center;
         background-size: contain;
         background-color: transparent;
      `;

      // Flash overlay (add this after modal is created)
      const flashOverlay = document.createElement('div');
      flashOverlay.style.cssText = `
         position: absolute;
         inset: 0;
         background: white;
         opacity: 0;
         pointer-events: none;
         z-index: 1;
      `;
      modal.appendChild(flashOverlay);

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '✕';
      cancelBtn.style.cssText = `
         position: absolute;
         top: 20px;
         right: 20px;
         font-size: 48px;
         line-height: 1;
         background: transparent;
         color: #f44336;
         border: none;
         border-color: transparent;
         cursor: pointer;
         font-weight: bold;
      `;

      buttons.appendChild(captureBtn);
      //buttons.appendChild(cancelBtn);
      modal.appendChild(buttons);
      modal.appendChild(lightBtn);
      modal.appendChild(cancelBtn);

      const torchCameraId = await findTorchCamera();
      if (!torchCameraId) {
         lightBtn.style.display = 'none';
      }

      // Request camera access
      navigator.mediaDevices
         .getUserMedia({
            video: torchCameraId
               ? { deviceId: { exact: torchCameraId } }
               : { facingMode: 'environment' }
         })
         .then(async (stream) => {
            document.body.appendChild(modal);
            video.srcObject = stream;
            await video.play();
            const tracks = stream.getVideoTracks();
            if (torchCameraId) {
               await toggleTorch(tracks, false);
            }

            captureBtn.addEventListener('click', () => {
               // ── Trigger animations ──
               captureBtn.classList.remove('camera-capture-animate');
               void captureBtn.offsetWidth; // force reflow to re-trigger
               captureBtn.classList.add('camera-capture-animate');

               flashOverlay.style.animation = 'none';
               void flashOverlay.offsetWidth;
               flashOverlay.style.animation = 'shutter-flash 0.4s ease forwards';

               setTimeout(() => {
                  const canvas = document.createElement('canvas');
                  canvas.width = video.videoWidth;
                  canvas.height = video.videoHeight;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(video, 0, 0);

                  tracks.forEach(track => track.stop());
                  modal.remove();

                  canvas.toBlob((blob) => {
                     resolve(blob);
                  }, 'image/webp', 1);
               }, 400);
            });

            lightBtn.addEventListener('click', async () => {
               lightBtn.classList.toggle('on');
               lightBtn.classList.toggle('off');
               const lightOn = lightBtn.classList.contains('on');
               await toggleTorch(tracks, lightOn);
            });

            cancelBtn.addEventListener('click', () => {
               tracks.forEach(track => track.stop());
               modal.remove();
               resolve(null);
            });
         })
         .catch((error) => {
            console.error('Camera error:', error);
            reject(new Error('Could not access camera. Please check permissions.'));
         });
   });
}


async function findTorchCamera() {
   const devices = await navigator.mediaDevices.enumerateDevices();

   const rearCameras = devices.filter(
      d =>
         d.kind === 'videoinput' &&
         d.label.toLowerCase().includes('back')
   );

   for (const camera of rearCameras) {
      let stream;

      try {
         stream = await navigator.mediaDevices.getUserMedia({
            video: {
               deviceId: { exact: camera.deviceId }
            }
         });

         const track = stream.getVideoTracks()[0];
         const capabilities = track.getCapabilities();
         stream.getTracks().forEach(t => t.stop());
         if (capabilities.torch) {
            return camera.deviceId;
         }
      } catch (err) {
         if (stream) {
            stream.getTracks().forEach(t => t.stop());
         }
      }
   }

   return null;
}


async function toggleTorch(tracks, turnOn) {
   for (const track of tracks) {
      try {
         await track.applyConstraints({ advanced: [{ torch: turnOn }] });
      } catch (e) {
         try {
            await track.applyConstraints({ torch: turnOn });
         } catch (e2) {
            console.error("torch access failed", e2);
         }
      }
   }
}


// ── Inject camera animation styles ─────────────────────────────────────────
function injectCameraStyles() {
   if (document.getElementById('camera-modal-styles')) return;
   const style = document.createElement('style');
   style.id = 'camera-modal-styles';
   style.textContent = `
      @keyframes shutter-flash {
         0%   { opacity: 0; }
         15%  { opacity: 0.3; }
         100% { opacity: 0; }
      }

      @keyframes ring-pulse {
         0%   { box-shadow: inset 0 0 15px 0px #4CAF50, 0 0 0 0px rgba(76, 175, 80, 0.7); }
         70%  { box-shadow: inset 0 0 15px 0px #4CAF50, 0 0 0 18px rgba(76, 175, 80, 0); }
         100% { box-shadow: inset 0 0 15px 0px #4CAF50, 0 0 0 0px rgba(76, 175, 80, 0); }
      }

      @keyframes btn-press {
         0%   { transform: scale(1); }
         30%  { transform: scale(0.88); }
         70%  { transform: scale(1.06); }
         100% { transform: scale(1); }
      }

      .camera-capture-animate {
         animation: btn-press 0.35s ease, ring-pulse 0.5s ease;
      }
   `;
   document.head.appendChild(style);
}