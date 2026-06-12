// ── Gallery operations ────────────────────────────────────────────────────
import * as store from '../data/store.js';
import { pushTab, popTab } from '../ui/navigation.js';
import { updateGallerySelection, exitGallerySelectionMode, getGallerySelectionManager } from '../ui/gallery-selection.js';
import { replaceCapImage, exportCapImage, deleteCapImage, deleteSelectedCaps, cropCapImage } from './caps.js';
import { handleAddCategoryClick, deleteCategory, updateCategoryTitles, updateCategoryColor, updateCapCountingForCategories } from '../ui/categories.js';
import { saveAppData } from './saving.js';
import Modal from '../ui/modal.js';
import { getWordForCount, isAllCategorySelected, checkBFVisibility, ALL_CAP_COLORS } from '../helpers/helper.js';
import { initColorCarousel } from '../ui/color-carousel.js';

const galleryList = document.getElementById('galleryList');
const galleryTitle = document.getElementById('galleryTitle');
const galleryColor = document.getElementById('galleryColor');
const stickyTop = document.getElementById('stickyTop');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const filterRow = document.getElementById('filterRow');
const moreBottomRow = document.getElementById('moreRow');
const deleteBtn = document.getElementById('gallery')?.querySelector('#deleteButton');

// Gallery cap color changer
let capColorSlimSelect = null;
export let slimSelectAfterChangeFunction = null;

// Details image buttons
let replaceBtn = document.getElementById('replaceImageBtn');
let cropBtn = document.getElementById('cropImageBtn');
let exportBtn = document.getElementById('exportImageBtn');
let deleteImageBtn = document.getElementById('deleteImageBtn');

export function setSlimColorPicker(slimSelect) {
   capColorSlimSelect = slimSelect;
}

export function openGallery(category, focusSearch = false) {
   store.setCurrentCategory(category);

   // Handle delete button - hide it if we're in 'all' category or if a filter is active
   if (deleteBtn) {
      const shouldHideDelete = isAllCategorySelected();
      deleteBtn.hidden = shouldHideDelete;
      deleteBtn.onclick = () => handleDeleteCategoryFromGallery(category);
   }

   capColorSlimSelect?.setSelected('');

   // Get category data
   const categoryObj = store.store.categories.find(c => c.id === category);

   // Title
   const displayName = category === 'all'
      ? 'All caps'
      : categoryObj?.name || category;
   galleryTitle.textContent = displayName;
   galleryTitle.title = "Gallery's title";
   galleryTitle.contentEditable = category !== 'all';

   // Make title editable (save on blur)
   if (category !== 'all') {
      galleryTitle.onblur = async () => {
         const newName = galleryTitle.textContent.trim();
         if (newName && categoryObj) {
            categoryObj.name = newName;
            await saveAppData();
            updateCategoryTitles(categoryObj);
         }
      };
   }

   // Set and update color input
   if (categoryObj) {
      galleryColor.value = categoryObj.color;
      galleryColor.oninput = async (e) => {
         categoryObj.color = e.target.value;

         // Update the category view
         updateCategoryColor(categoryObj);

         await saveAppData();
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
   galleryList.innerHTML = store.store.caps.map(cap => {
      let color;
      let colorFilter = "";

      if (checkBFVisibility(cap.color)) {
         color = cap.color;
      } else {
         color = '#111111';
         colorFilter = ' style="filter: none"';
      }

      return `<li data-category="${cap.category}" data-id="${cap.id}" data-color="${cap.color}" style="--clr-cap: ${cap.color}; background: ${cap.color}; color: ${color}" title="${cap.title}">
        <div class="cap-image-container">
          ${cap.imageWebP ? `<img src="blob:data" class="cap-image" data-blob="true" alt="${cap.title}" />` : '<div class="no-image">📷</div>'}
        </div>
        <div class="cap-title ${store.store.userSettings.showCapNames ? 'visible' : 'hidden'}"${colorFilter}>
          <div class="marquee-content" data-text="${cap.title}">${cap.title}</div>
        </div>
      </li>
    `}).join('');

   // Create blob URLs for all images
   const imageElements = galleryList.querySelectorAll('.cap-image-container');
   imageElements.forEach((imageContainer, index) => {
      const img = imageContainer.querySelector('img');
      if (img) {
         const cap = store.store.caps[index];
         const blobUrl = URL.createObjectURL(cap.imageWebP);
         img.src = blobUrl;
         img.dataset.blobUrl = blobUrl; // Store for cleanup
      }
   });

   // Show/hide filter row - only in ALL CAPS gallery
   if (filterRow && moreBottomRow) {
      const filtersDiv = filterRow.querySelector('#filters');
      const selectingDiv = moreBottomRow.querySelector('#selecting');
      filtersDiv.innerHTML = '';

      const topBar = document.getElementById('topbar');
      const updateSelectButtonCompactState = () => {
         const isOnSmallScreen = getComputedStyle(topBar).display === 'flex';
         const numberOfFilters = filtersDiv.querySelectorAll('.filter-chip:not(.filter-chip-plus)').length;
         const shouldCompactTheButtons = isOnSmallScreen ? numberOfFilters >= 1 : numberOfFilters >= 3;
         const selectButtons = selectingDiv.querySelectorAll('.selecting-chip:not(.stick-down):not(.stick-left)');
         selectButtons.forEach(btn => {
            if (shouldCompactTheButtons || category !== 'all') {
               const index = Array.from(selectButtons).indexOf(btn);
               btn.classList.add('compact');
               if (index === 0) btn.setAttribute('data-icon', '✔'); // select all
               else if (index === 1) btn.setAttribute('data-icon', '𐄂'); // deselect all
            } else {
               btn.classList.remove('compact');
               btn.removeAttribute('data-icon');
            }
         });
      };

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
               chip.style.setProperty('--clr-filter-chip', cat.color);
               chip.style.setProperty('--clr-filter-chip-active', `${cat.color}99`); // alpha at 0.7
               chip.dataset.id = cat.id;
               // Click to filter, not navigate - show only caps with this category
               chip.onclick = async () => {
                  const allSelected = isAllCategorySelected();
                  const selectionManager = getGallerySelectionManager(!allSelected, allSelected);

                  // If in selection mode, assign category to selected items
                  if (selectionManager && selectionManager.selectedItems.size > 0) {
                     selectionManager.selectedItems.forEach(capId => {
                        const capToUpdate = store.store.caps.find(c => c.id === capId);
                        if (capToUpdate) {
                           capToUpdate.category = cat.id;
                           capToUpdate.color = cat.color;
                        }
                     });
                     await saveAppData();
                     exitGallerySelectionMode();
                     openGallery('all');
                     updateCapCountingForCategories();
                  } else {
                     // Filter gallery to show only caps in this category
                     chip.classList.toggle('active');
                     const isActive = chip.classList.contains('active');

                     galleryList.querySelectorAll('li').forEach(li => {
                        const match = isActive ? chip.dataset.id === li.dataset.category : true;
                        li.classList.toggle('hidden', !match);
                     });

                     // Mark other chips as inactive
                     filtersDiv.querySelectorAll('.filter-chip').forEach(c => {
                        if (c !== chip) c.classList.remove('active');
                     });
                     // Re-initialize selection on filtered list
                     const allSelected = isAllCategorySelected();
                     updateGallerySelection(!allSelected, allSelected);
                     // Update select button compact state
                     updateSelectButtonCompactState();
                     // Update delete button visibility when filter changes
                     if (deleteBtn) {
                        const shouldHideDelete = isAllCategorySelected();
                        deleteBtn.hidden = shouldHideDelete;
                     }
                  }
               };
               filtersDiv.appendChild(chip);
            }
         });

         // Add plus chip to add new category
         const plusChip = document.createElement('button');
         plusChip.className = 'filter-chip filter-chip-plus';
         plusChip.textContent = '＋';
         plusChip.title = 'Add new category';
         plusChip.onclick = async () => {
            const status = await handleAddCategoryClick();
            if (status) {
               addLastCategoryToFilters();
               updateSelectButtonCompactState();

               const allSelected = isAllCategorySelected();
               const selectionManager = getGallerySelectionManager(!allSelected, allSelected);

               // If in selection mode, assign category to selected items
               if (selectionManager && selectionManager.selectedItems.size > 0) {
                  const cat = store.store.categories.at(-1);
                  selectionManager.selectedItems.forEach(capId => {
                     const capToUpdate = store.store.caps.find(c => c.id === capId);
                     if (capToUpdate) {
                        capToUpdate.category = cat.id;
                        capToUpdate.color = cat.color;
                     }
                  });
                  await saveAppData();
                  exitGallerySelectionMode();
                  openGallery('all');
               }
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

      updateSelectButtonCompactState();
   }

   // Search bar visibility (only in ALL gallery)
   searchBar.classList.toggle('visible', category === 'all');
   stickyTop.classList.toggle('hidden', category !== 'all');

   // Set gallery background based on category color
   const gallery = document.getElementById('gallery');
   if (gallery && categoryObj && categoryObj.color) {
      // Apply a subtle background color overlay from category color
      const rgb = parseInt(categoryObj.color.slice(1), 16);
      const r = (rgb >> 16) & 255;
      const g = (rgb >> 8) & 255;
      const b = rgb & 255;
      gallery.style.background = `linear-gradient(185deg,rgba(${r}, ${g}, ${b}, 0.05) 0%, rgba(${r}, ${g}, ${b}, 0.2) 100%)`;
   } else {
      gallery.style.background = '';
   }

   // Initialize selection mode for gallery items
   isAllCategorySelected() ? updateGallerySelection(false, true) : updateGallerySelection(true);

   // Click handlers (with selection mode integration)
   galleryList.querySelectorAll('li').forEach(li => {
      li.onclick = (e) => {
         const allSelected = isAllCategorySelected();
         const selectionManager = getGallerySelectionManager(!allSelected, allSelected);
         if (selectionManager.isSelectionMode) {
            if (selectionManager.selectedItems.size === 0) {
               selectionManager.exitSelectionMode();
            } else {
               e.preventDefault();
               e.stopPropagation();
            }
            return;
         }
         // otherwise open detail view
         const capId = li.dataset.id;
         const cap = store.store.caps.find(c => c.id === capId);
         if (cap) {
            store.setCurrentCategory(category);
            openDetails(capId);
         }
      };
   });

   // Select All / Deselect All buttons
   const selectingChips = document.querySelectorAll('.selecting-chip');
   const removeSelectedBtn = selectingChips[0];
   const capColorSelect = selectingChips[1];
   const selectAllBtn = selectingChips[3];
   const deselectAllBtn = selectingChips[4];
   const deleteSelectedBtn = selectingChips[5];

   if (removeSelectedBtn) {
      removeSelectedBtn.onclick = async () => {
         const selectionManager = getGallerySelectionManager(true);
         if (selectionManager) {
            const selectedCaps = selectionManager.getSelectedItems();

            if (selectedCaps.length > 0) {
               const confirmed = await Modal.confirm({
                  question: `Remove ${selectedCaps.length} ${getWordForCount(selectedCaps.length, 'cap')} from this category?\nThey will be available in "All caps".`,
                  yesLabel: 'Remove',
                  noLabel: 'Cancel',
               });

               if (confirmed) {
                  const selectedSet = new Set(selectedCaps);

                  for (const cap of store.store.caps) {
                     if (selectedSet.has(String(cap.id))) {
                        await store.updateCap(cap.id, {
                           ...cap,
                           category: 'all'
                        });
                     }
                  }

                  selectionManager.exitSelectionMode();
                  refreshGallery();
                  updateCapCountingForCategories();
               }
            }
         }
      };
   }

   if (capColorSlimSelect) {
      // add cap color logic for selected
      slimSelectAfterChangeFunction = async (selectedColor) => {
         const allSelected = isAllCategorySelected();
         const selectionManager = getGallerySelectionManager(!allSelected, allSelected);

         // If in selection mode, assign category to selected items
         if (selectionManager && selectionManager.selectedItems.size > 0) {
            selectionManager.selectedItems.forEach(capId => {
               const capToUpdate = store.store.caps.find(c => c.id === capId);
               if (capToUpdate) {
                  capToUpdate.color = selectedColor;
               }
            });
            await saveAppData();
            refreshGallery();
         }

         exitGallerySelectionMode();
      }
   }

   if (selectAllBtn) {
      selectAllBtn.onclick = () => {
         const allSelected = isAllCategorySelected();
         const selectionManager = getGallerySelectionManager(!allSelected, allSelected);
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
         const allSelected = isAllCategorySelected();
         const selectionManager = getGallerySelectionManager(!allSelected, allSelected);
         if (selectionManager) {
            selectionManager.exitSelectionMode();
         }
      };
   }

   if (deleteSelectedBtn) {
      deleteSelectedBtn.onclick = async () => {
         const allSelected = isAllCategorySelected();
         const selectionManager = getGallerySelectionManager(!allSelected, allSelected);
         if (selectionManager) {
            if (selectionManager.selectedItems.size !== 0) {
               await deleteSelectedCaps([...selectionManager.selectedItems]);
               refreshGallery();
               updateCapCountingForCategories();
            }
         }
      }
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

   //setMarqueeScroll();
   //setOverflowPostfix();

   pushTab('gallery');

   if (focusSearch) {
      setTimeout(() => searchInput.focus(), 350);
   }
}

/**
 * Handle category deletion from gallery view with confirmation
 */
async function handleDeleteCategoryFromGallery(categoryId) {
   const categoryObj = store.store.categories.find(c => c.id === categoryId);
   const capCount = store.store.caps.filter(c => c.category === categoryId).length;

   const confirmed = await Modal.confirm({
      question: `Delete "${categoryObj?.name || 'this category'}"?\n${capCount} ${getWordForCount(capCount, 'cap')} will be moved to "All caps".`,
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
export function refreshGallery(reopenGallery = true) {
   // Re-render current gallery to update colors
   const currentCat = store.currentCategory;
   const numberOfViewsOnStack = store.navStack.length;
   if (numberOfViewsOnStack === 2) {
      store.setNavStack(['categories', 'gallery']);
   } else if (numberOfViewsOnStack === 3) {
      store.setNavStack(['categories', 'gallery', 'details']);
   } else {
      store.setNavStack(['categories']);
   }
   if (reopenGallery) {
      openGallery(currentCat);
   }
}

export function openDetails(id) {
   const cap = store.store.caps.find(c => c.id === id);
   if (!cap) return;

   // Set details UI
   const detailsTitle = document.getElementById('detailsTitle');
   detailsTitle.textContent = cap.title;
   detailsTitle.title = "Cap's title";
   detailsTitle.onblur = async () => {
      const currentCap = store.store.caps.find(c => c.id === id);
      if (currentCap) {
         currentCap.title = detailsTitle.textContent;
         await saveAppData();
      }
   };

   // Set up category dropdown
   const detailsCategory = document.getElementById('detailsCategory');
   detailsCategory.innerHTML = '';

   // Add all categories
   store.store.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      opt.selected = (cap.category === cat.id);
      detailsCategory.appendChild(opt);
   });

   detailsCategory.onchange = async () => {
      const currentCap = store.store.caps.find(c => c.id === id);
      if (currentCap) {
         currentCap.category = detailsCategory.value || 'all';
         await saveAppData();
      }
   };

   const detailsDesc = document.getElementById('detailsDesc');
   detailsDesc.value = cap.description || '';
   detailsDesc.onblur = async () => {
      const currentCap = store.store.caps.find(c => c.id === id);
      if (currentCap) {
         currentCap.description = detailsDesc.value;
         await saveAppData();
      }
   };

   const charCount = detailsDesc.nextElementSibling;
   const countChars = () => {
      const len = detailsDesc.value.length;
      charCount.textContent = `${len} / 280`;
      charCount.className = 'mdl-char-count' + (len > 280 * 0.9 ? (len >= 280 ? ' over' : ' warn') : '');
   };
   detailsDesc.oninput = () => {
      countChars();
   };
   countChars(); // to initialise the counter

   const detailsImage = document.getElementById('detailsImage');
   detailsImage.style.background = cap.color;
   if (cap.imageWebP) {
      const blobUrl = URL.createObjectURL(cap.imageWebP);
      detailsImage.src = blobUrl;
      detailsImage.dataset.blobUrl = blobUrl; // Store for cleanup
      replaceBtn.innerText = '🔄 Replace';
      cropBtn.style.display = 'block';
      exportBtn.style.display = 'block';
      deleteImageBtn.style.display = 'block';
   } else {
      detailsImage.src = '';
      detailsImage.alt = 'No image added yet for this cap';
      replaceBtn.innerText = '➕ Add';
      cropBtn.style.display = 'none';
      exportBtn.style.display = 'none';
      deleteImageBtn.style.display = 'none';
   }

   // Show/hide image actions on image focus
   detailsImage.onclick = () => {
      const actionBar = document.querySelector('.image-actions');
      if (actionBar) {
         actionBar.classList.add('visible');
      }
   };

   document.onclick = (e) => {
      const actionBar = document.querySelector('.image-actions');
      if (actionBar && !actionBar.contains(e.target) && !detailsImage.contains(e.target)) {
         actionBar.classList.remove('visible');
      }
   };

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
         refreshGallery();
         updateCapCountingForCategories();
      }
   };

   pushTab('details');
}

function setupDetailsImageActions(capId) {
   const actionBar = document.querySelector('.image-actions');
   if (!actionBar) return;

   if (replaceBtn) {
      replaceBtn.onclick = async () => {
         const success = await replaceCapImage(capId);
         if (success) {
            openDetails(capId);
            replaceBtn.innerText = '🔄 Replace';
            cropBtn.style.display = 'block';
            exportBtn.style.display = 'block';
            deleteImageBtn.style.display = 'block';
         }
      };
   }

   if (cropBtn) {
      cropBtn.onclick = async () => {
         const success = await cropCapImage(capId);
         if (success) {
            openDetails(capId);
         }
      };
   }

   if (exportBtn) {
      exportBtn.onclick = async () => {
         const success = await exportCapImage(capId);
         if (success) {
            alert('Image exported to device!');
         }
      };
   }

   if (deleteImageBtn) {
      deleteImageBtn.onclick = async () => {
         const success = await deleteCapImage(capId);
         if (success) {
            openDetails(capId);
            replaceBtn.innerText = '➕ Add';
            cropBtn.style.display = 'none';
            exportBtn.style.display = 'none';
            deleteImageBtn.style.display = 'none';
         }
      };
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
         const id = li.dataset.id;
         const cap = store.store.caps.find(c => c.id === id);
         const match = !q || cap.title?.toLowerCase().includes(q) || cap.description?.toLowerCase().includes(q);
         li.style.display = match ? '' : 'none';
      });
   });
}

export function addLastCategoryToFilters() {
   //const selectionManager = await import('../ui/gallery-selection.js');
   const filtersDiv = filterRow.querySelector('#filters');
   const cat = store.store.categories.at(-1);

   const chip = document.createElement('button');
   chip.className = 'filter-chip';
   chip.textContent = cat.name;
   chip.style.borderColor = cat.color;
   chip.style.setProperty('--clr-filter-chip-active', `${cat.color}99`); // alpha at 0.7 == b3, 0.6 == 99
   chip.dataset.id = cat.id;
   // Click to filter, not navigate - show only caps with this category
   chip.onclick = async () => {
      const allSelected = isAllCategorySelected();
      const selectionManager = getGallerySelectionManager(!allSelected, allSelected);

      // If in selection mode, assign category to selected items
      if (selectionManager && selectionManager.selectedItems.size > 0) {
         selectionManager.selectedItems.forEach(capId => {
            const capToUpdate = store.store.caps.find(c => c.id === capId);
            if (capToUpdate) {
               capToUpdate.category = cat.id;
               capToUpdate.color = cat.color;
            }
         });
         await saveAppData();
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
         const allSelected = isAllCategorySelected();
         updateGallerySelection(!allSelected, allSelected);
      }
   };
   filtersDiv.appendChild(chip);
}

export function updateGalleryList() {
   const items = Array.from(
      galleryList.querySelectorAll('li')
   );

   const caps = store.store.caps;

   items.forEach((li, index) => {
      const cap = caps[index];
      if (!cap) return;

      li.title = cap.title;
      li.dataset.id = cap.id;
      li.dataset.category = cap.category;
      const img = li.querySelector(".cap-image-container img");
      if (img) {
         img.alt = cap.title;
      }
      li.querySelector(".cap-title").innerText = cap.title;
   });

   refreshGallery();
}
