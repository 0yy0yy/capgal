/**
 * Gallery Selection – Initialize SelectionManager for gallery items
 * Integrates selection mode into the gallery view
 */
import { SelectionManager } from './selectionManager.js';

let gallerySelectionManager = null;
const removeButton = document.getElementsByClassName("selecting-chip stick-left")[0];

export function initGallerySelection(showRemoveButton = false) {
   const galleryList = document.getElementById('galleryList');

   if (!galleryList) return; // Gallery not yet rendered

   gallerySelectionManager = new SelectionManager({
      delay: 350,
      onSelectionChange: (selectedIds) => {
         // Update UI to show selection count
         const countEl = document.getElementById('selection-count');
         if (countEl) {
            countEl.textContent = `${selectedIds.length} selected`;
         }
         console.log('Selected items:', selectedIds);
      },
      onSelectionModeChange: (isActive) => {
         // Show/hide selection toolbar, etc.
         const toolbar = document.querySelector('.selection-toolbar');
         if (toolbar) {
            toolbar.classList.toggle('active', isActive);
         }

         // Add/remove selection mode class to gallery
         galleryList.classList.toggle('selection-mode', isActive);

         //Show/hide the remove button
         if (showRemoveButton) {
            removeButton.style.display = isActive ? 'block' : 'none';
         }

         console.log('Selection mode:', isActive ? 'ON' : 'OFF');
      }
   });

   // Add items to selection manager
   galleryList.querySelectorAll('li').forEach((li, index) => {
      const capId = li.dataset.id || `item-${index}`;
      gallerySelectionManager.addSelectableItem(li, capId);
   });
}

/**
 * Re-initialize selection manager when gallery items change
 * Call this after gallery items are rendered
 */
export function updateGallerySelection(showRemoveButton = false) {
   if (gallerySelectionManager) {
      gallerySelectionManager.deselectAll();
   }
   initGallerySelection(showRemoveButton);
}

/**
 * Get the current selection manager instance
 */
export function getGallerySelectionManager() {
   return gallerySelectionManager;
}

/**
 * Exit selection mode
 */
export function exitGallerySelectionMode() {
   if (gallerySelectionManager) {
      gallerySelectionManager.exitSelectionMode();
   }
}
