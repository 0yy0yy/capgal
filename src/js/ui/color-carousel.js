/**
 * Color Carousel Manager
 * Handles carousel navigation for color picker with swipe, drag, and button controls
 */

export function initColorCarousel() {
   const colorPicker = document.getElementById('detailsColorPicker');
   const colorPickerTrack = document.getElementById('colorPickerTrack');
   const navPrev = document.querySelector('.carousel-nav-prev');
   const navNext = document.querySelector('.carousel-nav-next');

   if (!colorPickerTrack || !navPrev || !navNext) return;

   const colorGroups = colorPickerTrack.querySelectorAll('.color-group');
   let currentIndex = 0;
   let isAnimating = false;
   let startX = 0;
   let currentX = 0;
   let isDragging = false;
   const swipeThreshold = 50; // Minimum distance to trigger swipe

   /**
    * Find which color group contains the selected button
    */
   function findSelectedGroupIndex() {
      const selectedButton = colorPickerTrack.querySelector('.color-picker-btn.selected');
      if (!selectedButton) return 0;

      for (let i = 0; i < colorGroups.length; i++) {
         if (colorGroups[i].contains(selectedButton)) {
            return i;
         }
      }
      return 0;
   }

   /**
    * Update carousel position and button states
    */
   function updateCarousel(index, animate = true) {
      if (isAnimating) return;

      // Clamp index to valid range
      index = Math.max(0, Math.min(index, colorGroups.length - 1));

      // Always apply transform (even if index didn't change) to snap back in place
      currentIndex = index;

      // Apply transform to carousel track
      const offset = -index * 100;
      if (animate) {
         isAnimating = true;
         colorPickerTrack.style.transition = 'transform 0.35s cubic-bezier(0.4, 0.0, 0.2, 1)';
      } else {
         colorPickerTrack.style.transition = 'none';
      }

      colorPickerTrack.style.transform = `translateX(${offset}%)`;

      // Update button states
      navPrev.disabled = currentIndex === 0;
      navNext.disabled = currentIndex === colorGroups.length - 1;

      if (animate) {
         setTimeout(() => {
            isAnimating = false;
         }, 350);
      }
   }

   /**
    * Handle button clicks
    */
   navPrev.addEventListener('click', () => {
      updateCarousel(currentIndex - 1);
   });

   navNext.addEventListener('click', () => {
      updateCarousel(currentIndex + 1);
   });

   /**
    * Handle touch events (swipe on touch devices)
    */
   colorPickerTrack.addEventListener('touchstart', (e) => {
      if (isAnimating) return;
      isDragging = true;
      startX = e.touches[0].clientX;
      currentX = startX;
      colorPickerTrack.style.transition = 'none';
   }, { passive: true });

   colorPickerTrack.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
      const deltaX = currentX - startX;
      const offset = -currentIndex * 100 + (deltaX / colorPicker.offsetWidth) * 100;
      colorPickerTrack.style.transform = `translateX(${offset}%)`;
   }, { passive: true });

   colorPickerTrack.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;

      const deltaX = currentX - startX;
      let newIndex = currentIndex;

      if (Math.abs(deltaX) > swipeThreshold) {
         newIndex = deltaX > 0 ? currentIndex - 1 : currentIndex + 1;
      }

      updateCarousel(newIndex);
   });

   /**
    * Handle mouse drag (click and drag to swipe)
    */
   let mouseStartX = 0;
   let mouseCurrentX = 0;
   let isMouseDragging = false;

   colorPickerTrack.addEventListener('mousedown', (e) => {
      if (isAnimating) return;
      isMouseDragging = true;
      mouseStartX = e.clientX;
      mouseCurrentX = mouseStartX;
      colorPickerTrack.style.transition = 'none';
      colorPickerTrack.style.cursor = 'grabbing';
      colorPickerTrack.classList.add('is-dragging');
   });

   document.addEventListener('mousemove', (e) => {
      if (!isMouseDragging) return;
      mouseCurrentX = e.clientX;
      const deltaX = mouseCurrentX - mouseStartX;
      const offset = -currentIndex * 100 + (deltaX / colorPicker.offsetWidth) * 100;
      colorPickerTrack.style.transform = `translateX(${offset}%)`;
   });

   document.addEventListener('mouseup', () => {
      if (!isMouseDragging) return;
      isMouseDragging = false;
      colorPickerTrack.style.cursor = 'grab';
      colorPickerTrack.classList.remove('is-dragging');

      const deltaX = mouseCurrentX - mouseStartX;
      let newIndex = currentIndex;

      if (Math.abs(deltaX) > swipeThreshold) {
         newIndex = deltaX > 0 ? currentIndex - 1 : currentIndex + 1;
      }

      updateCarousel(newIndex);
   });

   // Initialize to the carousel view containing the selected color
   const selectedIndex = findSelectedGroupIndex();
   updateCarousel(selectedIndex, false);
}
