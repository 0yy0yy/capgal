/**
 * Gallery Selection – Initialize SelectionManager for gallery items
 * Integrates selection mode into the gallery view
 */
import { SelectionManager } from './selectionManager.js';

let gallerySelectionManager = null;
const removeButton = document.getElementsByClassName("selecting-chip stick-left")[0];
const capColorPicker = document.getElementById("colorPickerCategoryCapsSelect");
let capColorSlimSelect = null;
const deleteButton = document.getElementsByClassName("selecting-chip stick-down")[0];

export function setSlimColorPicker(slimSelect) {
   capColorSlimSelect = slimSelect.slimSelect;
}

export function initGallerySelection(showRemoveButton = false, showDeleteButton = false) {
   const galleryList = document.getElementById('galleryList');

   if (!galleryList) return; // Gallery not yet rendered

   gallerySelectionManager = new SelectionManager({
      container: galleryList,
      delay: 350,
      onSelectionChange: (selectedIds) => {
         // Update UI to show selection count
         /* const countEl = document.getElementById('selection-count');
         if (countEl) {
            countEl.textContent = `${selectedIds.length} selected`;
         } */
      },
      onSelectionModeChange: (isActive) => {
         // Show/hide selection toolbar, etc.
         /* const toolbar = document.querySelector('.selection-toolbar');
         if (toolbar) {
            toolbar.classList.toggle('active', isActive);
         } */

         // Add/remove selection mode class to gallery
         galleryList.classList.toggle('selection-mode', isActive);

         //Show/hide the remove button
         if (showRemoveButton) {
            removeButton.style.display = isActive ? 'block' : 'none';
            //capColorPicker.style.display = isActive ? 'block' : 'none';
            isActive ? capColorSlimSelect.removeAttribute('hidden') : capColorSlimSelect.setAttribute('hidden', 'hidden');
         }

         if (showDeleteButton) {
            isActive ? deleteButton.removeAttribute("hidden") : deleteButton.setAttribute("hidden", "hidden");
         }
      }
   });

   // Add items to selection manager
   galleryList.querySelectorAll('li').forEach((li, index) => {
      const capId = li.dataset.id || index;
      gallerySelectionManager.addSelectableItem(li, capId);
   });
}

/**
 * Re-initialize selection manager when gallery items change
 * Call this after gallery items are rendered
 */
export function updateGallerySelection(showRemoveButton = false, showDeleteButton = false) {
   if (gallerySelectionManager) {
      gallerySelectionManager.deselectAll();
   }
   initGallerySelection(showRemoveButton, showDeleteButton);
}

/**
 * Get the current selection manager instance
 */
export function getGallerySelectionManager(showRemoveButton = false, showDeleteButton = false) {
   //Show/hide the remove button
   if (showRemoveButton) {
      removeButton.style.display = gallerySelectionManager ? 'block' : 'none';
      //capColorPicker.style.display = gallerySelectionManager ? 'block' : 'none';
      gallerySelectionManager ? capColorSlimSelect.removeAttribute('hidden') : capColorSlimSelect.setAttribute('hidden', 'hidden');
   }

   if (showDeleteButton) {
      gallerySelectionManager ? deleteButton.removeAttribute("hidden") : deleteButton.setAttribute("hidden", "hidden");
   }

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