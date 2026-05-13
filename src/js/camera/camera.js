// ── Camera capture functionality ───────────────────────────────────────────

/**
 * Show camera modal for taking photos
 */
export async function showCameraModal() {
   return new Promise((resolve, reject) => {
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
      captureBtn.textContent = '📸 Take Photo';
      captureBtn.style.cssText = `
         padding: 12px 24px;
         font-size: 16px;
         background: #4CAF50;
         color: white;
         border: none;
         border-radius: 8px;
         cursor: pointer;
         font-weight: bold;
      `;

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '✕ Cancel';
      cancelBtn.style.cssText = `
         padding: 12px 24px;
         font-size: 16px;
         background: #f44336;
         color: white;
         border: none;
         border-radius: 8px;
         cursor: pointer;
         font-weight: bold;
      `;

      buttons.appendChild(captureBtn);
      buttons.appendChild(cancelBtn);
      modal.appendChild(buttons);

      // Request camera access
      navigator.mediaDevices
         .getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
         })
         .then((stream) => {
            document.body.appendChild(modal);
            video.srcObject = stream;
            video.play();

            const tracks = stream.getTracks();

            captureBtn.addEventListener('click', () => {
               const canvas = document.createElement('canvas');
               canvas.width = video.videoWidth;
               canvas.height = video.videoHeight;
               const ctx = canvas.getContext('2d');
               ctx.drawImage(video, 0, 0);

               // Stop camera
               tracks.forEach(track => track.stop());
               modal.remove();

               canvas.toBlob((blob) => {
                  resolve(blob);
               }, 'image/webp', 1);
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
