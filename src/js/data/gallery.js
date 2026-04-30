// ── Gallery operations ────────────────────────────────────────────────────
import * as store from '../data/store.js';
import { pushTab, popTab } from '../ui/navigation.js';
import { updateGallerySelection, exitGallerySelectionMode, getGallerySelectionManager } from '../ui/gallery-selection.js';
import { replaceCapImage, exportCapImage, deleteCapImage } from './caps.js';
import { deleteCategory } from '../ui/categories.js';
import { saveAppData } from './saving.js';
import Modal from '../ui/modal.js';

const galleryList = document.getElementById('galleryList');
const galleryTitle = document.getElementById('galleryTitle');
const galleryColor = document.getElementById('galleryColor');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const filterRow = document.getElementById('filterRow');
const deleteBtn = document.getElementById('gallery')?.querySelector('#deleteButton');

export function openGallery(category, focusSearch = false) {
   store.setCurrentCategory(category);

   // Handle delete button
   if (deleteBtn) {
      deleteBtn.hidden = (category === 'all');
      deleteBtn.onclick = () => handleDeleteCategory(category);
   }

   // Get category data
   const categoryObj = store.store.categories.find(c => c.id === category);

   // Title
   const displayName = category === 'all'
      ? 'ALL caps'
      : categoryObj?.name || category;
   galleryTitle.textContent = displayName;
   galleryTitle.contentEditable = category !== 'all';

   // Make title editable (save on blur)
   if (category !== 'all') {
      galleryTitle.onblur = () => {
         const newName = galleryTitle.textContent.trim();
         if (newName && categoryObj) {
            categoryObj.name = newName;
            saveAppData();
         }
      };
   }

   // Set and update color input
   if (categoryObj) {
      galleryColor.value = categoryObj.color;
      galleryColor.oninput = (e) => {
         categoryObj.color = e.target.value;
         saveAppData();
         // Update gallery background
         const gallery = document.getElementById('gallery');
         if (gallery) {
            const rgb = parseInt(e.target.value.slice(1), 16);
            const r = (rgb >> 16) & 255;
            const g = (rgb >> 8) & 255;
            const b = rgb & 255;
            gallery.style.background = `linear-gradient(185deg,rgba(${r}, ${g}, ${b}, 0.05) 0%, rgba(${r}, ${g}, ${b}, 0.2) 100%)`;
         }
      };
      galleryColor.hidden = false;
   }

   // Render items
   galleryList.innerHTML = store.store.caps.map(cap => `
      <li data-category="${cap.category}" data-id="${cap.id}" style="background:${cap.color}" title="${cap.tag}">
        <div class="cap-image-container">
          ${cap.imageBase64 ? `<img src="data:image/jpeg;base64,${cap.imageBase64}" alt="${cap.tag}" />` : '<div class="no-image">📷</div>'}
        </div>
        <div class="cap-title ${store.store.userSettings.showCapNames ? 'visible' : 'hidden'}">
          ${cap.title || cap.tag}
        </div>
      </li>
    `).join('');

   // Show/hide filter row - only in ALL CAPS gallery
   if (filterRow) {
      const filtersDiv = filterRow.querySelector('#filters');
      const selectingDiv = filterRow.querySelector('#selecting');
      filtersDiv.innerHTML = '';

      if (category === 'all') {
         filtersDiv.style.display = 'flex';
         filterRow.style.justifyContent = 'space-between';
         // Add filter chips for all categories except "all" - FILTER list, not navigate
         store.store.categories.forEach(cat => {
            if (cat.id !== 'all') {
               const chip = document.createElement('button');
               chip.className = 'filter-chip';
               chip.textContent = cat.name;
               chip.style.borderColor = cat.color;
               // Click to filter, not navigate - show only caps with this category
               chip.onclick = () => {
                  const selectionManager = getGallerySelectionManager();

                  // If in selection mode, assign category to selected items
                  if (selectionManager && selectionManager.selectedItems.size > 0) {
                     selectionManager.selectedItems.forEach(capId => {
                        const capToUpdate = store.store.caps.find(c => c.id === parseInt(capId));
                        if (capToUpdate) {
                           capToUpdate.category = cat.id;
                        }
                     });
                     saveAppData();
                     exitGallerySelectionMode();
                     openGallery('all');
                  } else {
                     // Filter gallery to show only caps in this category
                     chip.classList.toggle('active');
                     const isActive = chip.classList.contains('active');

                     galleryList.querySelectorAll('li').forEach(li => {
                        const match = isActive ? chip.innerText === li.dataset.category : true;
                        li.classList.toggle('hidden', !match);
                     });

                     // Mark other chips as inactive
                     filtersDiv.querySelectorAll('.filter-chip').forEach(c => {
                        if (c !== chip) c.classList.remove('active');
                     });
                     // Re-initialize selection on filtered list
                     updateGallerySelection();
                  }
               };
               filtersDiv.appendChild(chip);
            }
         });

         // Add plus chip to add new category
         const plusChip = document.createElement('button');
         plusChip.className = 'filter-chip filter-chip-plus';
         plusChip.textContent = '+';
         plusChip.onclick = async () => {
            const result = await Modal.addItem({ type: 'category' });
            if (result) {
               store.store.categories.push(result);
               await saveAppData();

               // If in selection mode, also assign the new category to selected items
               const selectionManager = getGallerySelectionManager();
               if (selectionManager && selectionManager.selectedItems.size > 0) {
                  selectionManager.selectedItems.forEach(capId => {
                     const capToUpdate = store.store.caps.find(c => c.id === parseInt(capId));
                     if (capToUpdate) {
                        capToUpdate.category = result.id;
                     }
                  });
                  await saveAppData();
                  exitGallerySelectionMode();
               }

               openGallery('all');
            }
         };
         filtersDiv.prepend(plusChip);
      } else {
         // Non-ALL categories should show filter row with remove button in selection mode
         filtersDiv.style.display = 'none';
         filterRow.style.justifyContent = 'flex-end';

         // Filter to show only the appropriate caps
         galleryList.querySelectorAll('li').forEach(li => {
            const match = category === li.dataset.category;
            li.classList.toggle('hidden', !match);
         });
      }
   }

   // Search bar visibility (only in ALL gallery)
   searchBar.classList.toggle('visible', category === 'all');

   // Set gallery background based on category color
   const gallery = document.getElementById('gallery');
   if (gallery && categoryObj && categoryObj.color) {
      // Apply a subtle background color overlay from category color
      const rgb = parseInt(categoryObj.color.slice(1), 16);
      const r = (rgb >> 16) & 255;
      const g = (rgb >> 8) & 255;
      const b = rgb & 255;
      gallery.style.background = `rgba(${r}, ${g}, ${b}, 0.04)`;
   } else {
      gallery.style.background = '';
   }

   // Initialize selection mode for gallery items
   category === 'all' ? updateGallerySelection() : updateGallerySelection(true);

   // Click handlers (with selection mode integration)
   galleryList.querySelectorAll('li').forEach(li => {
      li.onclick = (e) => {
         const selectionManager = getGallerySelectionManager();
         // If in selection mode, toggle selection. Otherwise, open details.
         if (selectionManager && selectionManager.isSelectionMode) {
            // Prevent opening details, let selection manager handle it
            e.stopPropagation();
         } else {
            const capId = parseInt(li.dataset.id, 10);
            const cap = store.store.caps.find(c => c.id === capId);
            if (cap) {
               store.setCurrentCategory(category);
               openDetails(capId);
            }
         }
      };
   });

   // Select All / Deselect All buttons
   const selectingChips = document.querySelectorAll('.selecting-chip');
   const removeSelectedBtn = selectingChips[0];
   const selectAllBtn = selectingChips[1];
   const deselectAllBtn = selectingChips[2];

   if (removeSelectedBtn) {
      removeSelectedBtn.onclick = () => {
         const selectionManager = getGallerySelectionManager();
         if (selectionManager) {
            const selectedCaps = selectionManager.getSelectedItems();
            const selectedSet = new Set(selectedCaps);

            store.store.caps.forEach(cap => {
               if (selectedSet.has(String(cap.id))) {
                  store.updateCap(cap.id, {
                     ...cap,
                     category: 'all'
                  });
               }
            });

            selectionManager.exitSelectionMode();
            refreshGallery()
         }
      };
   }

   if (selectAllBtn) {
      selectAllBtn.onclick = () => {
         const selectionManager = getGallerySelectionManager();
         if (selectionManager) {
            if (selectionManager.selectableItems.length === 0) {
               selectionManager.isSelectionMode = true;
               selectionManager.onSelectionModeChange(true);
            }
            selectionManager.selectAll();
         }
      };
   }

   if (deselectAllBtn) {
      deselectAllBtn.onclick = () => {
         const selectionManager = getGallerySelectionManager();
         if (selectionManager) {
            selectionManager.exitSelectionMode();
         }
      };
   }

   // Apply texture background if set
   if (gallery) {
      const textureClass = store.store.userSettings.galleryBackgroundTexture;
      // Remove all texture classes
      gallery.classList.remove('cracks-texture', 'dirty-wall-texture', 'fabric-texture', 'grunge-texture', 'sand-texture', 'wood-texture');
      // Add new texture class if not 'none'
      if (textureClass && textureClass !== 'none') {
         gallery.classList.add(textureClass);
      }
   }

   pushTab('gallery');

   if (focusSearch) {
      setTimeout(() => searchInput.focus(), 350);
   }
}

/**
 * Handle category deletion with confirmation
 */
async function handleDeleteCategory(categoryId) {
   const categoryObj = store.store.categories.find(c => c.id === categoryId);
   const capCount = store.store.caps.filter(c => c.category === categoryId).length;

   const confirmed = await Modal.confirm({
      question: `Delete "${categoryObj?.name || 'Category'}"? ${capCount} cap(s) will be moved to "All".`,
      yesLabel: 'Delete',
      noLabel: 'Cancel',
   });

   if (confirmed) {
      await deleteCategory(categoryId);
      // Go back to categories view
      popTab();
   }
}

/**
 * Refresh gallery colors after update
 */
function refreshGallery() {
   // Re-render current gallery to update colors
   const currentCat = store.currentCategory;
   openGallery(currentCat);
}

export function openDetails(id) {
   const cap = store.store.caps.find(c => c.id === id);
   if (!cap) return;

   // Set details UI
   const detailsTitle = document.getElementById('detailsTitle');
   detailsTitle.textContent = cap.title || cap.tag;
   detailsTitle.addEventListener('blur', () => {
      cap.title = detailsTitle.textContent;
      store.store.caps.find(c => c.id === id).title = cap.title;
      saveAppData();
   });

   // Set up category dropdown
   const detailsCategory = document.getElementById('detailsCategory');
   detailsCategory.innerHTML = '';

   // Add all categories except 'all'
   store.store.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      opt.selected = (cap.category === cat.id);
      detailsCategory.appendChild(opt);
   });

   // Add 'all' option if no category is set
   if (!cap.category || cap.category === 'all' || !store.store.categories.find(c => c.id === cap.category)) {
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = 'all';
      allOpt.selected = true;
      detailsCategory.insertBefore(allOpt, detailsCategory.firstChild);
   }

   detailsCategory.addEventListener('change', () => {
      cap.category = detailsCategory.value || '';
      store.store.caps.find(c => c.id === id).category = cap.category;
      saveAppData();
   });

   const detailsDesc = document.getElementById('detailsDesc');
   detailsDesc.value = cap.description || '';
   detailsDesc.addEventListener('blur', () => {
      cap.description = detailsDesc.value;
      store.store.caps.find(c => c.id === id).description = cap.description;
      saveAppData();
   });

   const detailsImage = document.getElementById('detailsImage');
   detailsImage.style.background = cap.color;
   if (cap.imageBase64) {
      detailsImage.src = `data:image/jpeg;base64,${cap.imageBase64}`;
      detailsImage.style.minHeight = '180px';
   } else {
      detailsImage.src = '';
      detailsImage.style.minHeight = '';
      detailsImage.textContent = 'No image';
   }

   // Show/hide image actions on image focus
   detailsImage.addEventListener('click', () => {
      const actionBar = document.querySelector('.image-actions');
      if (actionBar) {
         //actionBar.style.display = actionBar.style.display === 'none' ? 'flex' : 'none';
         actionBar.classList.add('visible');
      }
   });

   document.addEventListener('click', (e) => {
      const actionBar = document.querySelector('.image-actions');
      if (actionBar && !actionBar.contains(e.target) && !detailsImage.contains(e.target)) {
         //actionBar.style.display = 'none';
         actionBar.classList.remove('visible');
      }
   });

   // Set up image action buttons
   setupDetailsImageActions(id);

   // Set up delete cap button
   const detailsHeader = document.getElementById('details').querySelector('.tab-header');
   let deleteBtn = detailsHeader.querySelector('#deleteButton');
   if (!deleteBtn) {
      deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.id = 'deleteButton';
      deleteBtn.title = 'Delete cap';
      detailsHeader.appendChild(deleteBtn);
   }
   deleteBtn.onclick = async () => {
      const confirmed = await Modal.confirm({
         question: 'Delete this cap permanently? This cannot be undone.',
         yesLabel: 'Yes, delete',
         noLabel: 'Cancel',
      });
      if (confirmed) {
         store.store.caps = store.store.caps.filter(c => c.id !== id);
         await saveAppData();
         popTab();
         openGallery(store.currentCategory);
      }
   };

   pushTab('details');
}

function setupDetailsImageActions(capId) {
   const actionBar = document.querySelector('.image-actions');
   if (!actionBar) return;

   // Clear existing event listeners by cloning
   const newActionBar = actionBar.cloneNode(true);
   actionBar.parentNode.replaceChild(newActionBar, actionBar);

   const replaceBtn = newActionBar.querySelector('#replaceImageBtn');
   const exportBtn = newActionBar.querySelector('#exportImageBtn');
   const deleteBtn = newActionBar.querySelector('#deleteImageBtn');

   if (replaceBtn) {
      replaceBtn.addEventListener('click', async () => {
         const success = await replaceCapImage(capId);
         if (success) {
            openDetails(capId);
         }
      });
   }

   if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
         const success = await exportCapImage(capId);
         if (success) {
            alert('Image exported to device!');
         }
      });
   }

   if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
         const success = await deleteCapImage(capId);
         if (success) {
            openDetails(capId);
         }
      });
   }
}

export function updateGalleryTitleVisibility(show) {
   const titles = document.querySelectorAll('#galleryList .cap-title');
   titles.forEach(title => {
      title.classList.toggle('visible', show);
      title.classList.toggle('hidden', !show);
   });
}

export function initGallerySearch() {
   searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      galleryList.querySelectorAll('li').forEach(li => {
         const id = Number(li.dataset.id);
         const cap = store.store.caps.find(c => c.id === id);
         const match = !q || cap.tag.toLowerCase().includes(q)
            || cap.title?.toLowerCase().includes(q)
            || cap.description?.toLowerCase().includes(q);
         li.style.display = match ? '' : 'none';
      });
   });
}
