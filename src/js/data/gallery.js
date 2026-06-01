// ── Gallery operations ────────────────────────────────────────────────────
import * as store from '../data/store.js';
import { pushTab, popTab } from '../ui/navigation.js';
import { updateGallerySelection, exitGallerySelectionMode, getGallerySelectionManager } from '../ui/gallery-selection.js';
import { replaceCapImage, exportCapImage, deleteCapImage, deleteSelectedCaps, cropCapImage } from './caps.js';
import { handleAddCategoryClick, deleteCategory, updateCategoryTitles } from '../ui/categories.js';
import { saveAppData } from './saving.js';
import Modal from '../ui/modal.js';
import { getWordForCount, setMarqueeScroll, isAllCategorySelected, checkBFVisibility, ALL_CAP_COLORS } from '../helpers/helper.js';
import { initColorCarousel } from '../ui/color-carousel.js';

const galleryList = document.getElementById('galleryList');
const galleryTitle = document.getElementById('galleryTitle');
const galleryColor = document.getElementById('galleryColor');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');
const filterRow = document.getElementById('filterRow');
const deleteBtn = document.getElementById('gallery')?.querySelector('#deleteButton');

export function openGallery(category, focusSearch = false) {
   store.setCurrentCategory(category);

   // Handle delete button - hide it if we're in 'all' category or if a filter is active
   if (deleteBtn) {
      const shouldHideDelete = isAllCategorySelected();
      deleteBtn.hidden = shouldHideDelete;
      deleteBtn.onclick = () => handleDeleteCategoryFromGallery(category);
   }

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
      return `<li data-category="${cap.category}" data-id="${cap.id}" style="background:${cap.color}; color:${color}" title="${cap.title}">
        <div class="cap-image-container">
          ${cap.imageWebP ? `<img src="blob:data" class="cap-image" data-blob="true" alt="${cap.title}" />` : '<div class="no-image">📷</div>'}
        </div>
        <div class="cap-title ${store.store.userSettings.showCapNames ? 'visible' : 'hidden'}"${colorFilter}>
          <div class="marquee-content" data-text="${cap.title}"></div>
        </div>
      </li>
    `}).join('');

   // Create blob URLs for all images
   const imageElements = galleryList.querySelectorAll('img[data-blob="true"]');
   imageElements.forEach((img, index) => {
      const cap = store.store.caps[index];
      if (cap?.imageWebP) {
         const blobUrl = URL.createObjectURL(cap.imageWebP);
         img.src = blobUrl;
         img.dataset.blobUrl = blobUrl; // Store for cleanup
      }
   });

   // Show/hide filter row - only in ALL CAPS gallery
   if (filterRow) {
      const filtersDiv = filterRow.querySelector('#filters');
      const selectingDiv = filterRow.querySelector('#selecting');
      filtersDiv.innerHTML = '';

      const topBar = document.getElementById('topbar');
      const updateSelectButtonCompactState = () => {
         const isOnSmallScreen = getComputedStyle(topBar).display === 'flex';
         const numberOfFilters = filtersDiv.querySelectorAll('.filter-chip:not(.filter-chip-plus)').length;
         const shouldCompactTheButtons = isOnSmallScreen ? numberOfFilters >= 1 : numberOfFilters >= 3;
         const selectButtons = selectingDiv.querySelectorAll('.selecting-chip');
         selectButtons.forEach(btn => {
            if (shouldCompactTheButtons) {
               const index = Array.from(selectButtons).indexOf(btn);
               if (index !== 0) {
                  btn.classList.add('compact');
                  if (index === 1) btn.setAttribute('data-icon', '✔'); // select all
                  else if (index === 2) btn.setAttribute('data-icon', '𐄂'); // deselect all
               }
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
         plusChip.textContent = '+';
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
                  const catId = store.store.categories.at(-1).id;
                  selectionManager.selectedItems.forEach(capId => {
                     const capToUpdate = store.store.caps.find(c => c.id === capId);
                     if (capToUpdate) {
                        capToUpdate.category = catId;
                     }
                  });
                  await saveAppData();
                  exitGallerySelectionMode();
                  openGallery('all');
               }
            }
         };
         filtersDiv.prepend(plusChip);
         // Initial compact state check
         updateSelectButtonCompactState();
      } else {
         // Non-ALL categories should show filter row with remove button in selection mode
         filtersDiv.style.display = 'none';
         filterRow.style.justifyContent = 'flex-end';

         updateSelectButtonCompactState();

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
   const selectAllBtn = selectingChips[1];
   const deselectAllBtn = selectingChips[2];
   const deleteSelectedBtn = selectingChips[3];

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
               }
            }
         }
      };
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

   setMarqueeScroll();

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
      detailsImage.style.minHeight = '180px';

      // Show image actions when image is loaded
      /* const actionBar = document.querySelector('.image-actions');
      if (actionBar) {
         actionBar.classList.add('visible');
      } */
   } else {
      detailsImage.src = '';
      detailsImage.style.minHeight = '';
      detailsImage.textContent = 'No image added yet for this cap entry';

      // Hide image actions if no image
      /* const actionBar = document.querySelector('.image-actions');
      if (actionBar) {
         actionBar.classList.remove('visible');
      } */
   }

   // Show/hide image actions on image focus
   detailsImage.onclick = () => {
      const actionBar = document.querySelector('.image-actions');
      if (actionBar) {
         //actionBar.style.display = actionBar.style.display === 'none' ? 'flex' : 'none';
         actionBar.classList.add('visible');
      }
   };

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
         /* popTab();
         openGallery(store.currentCategory); */
         refreshGallery();
      }
   };

   // Set up color picker
   const colorPickerContainer = document.getElementById('detailsColorPicker');
   const colorSwatches = colorPickerContainer.querySelectorAll('.color-picker-btn');

   // Clear all selected states first
   colorSwatches.forEach(btn => {
      btn.classList.remove('selected');
   });

   // Set up click handlers and mark the correct one as selected
   colorSwatches.forEach(colorBtn => {
      const color = colorBtn.title;
      if (color === cap.color) {
         colorBtn.classList.add('selected');
      }

      colorBtn.onclick = async () => {
         // Update UI - remove selected class from ALL buttons across the entire carousel
         colorSwatches.forEach(btn => {
            btn.classList.remove('selected');
         });

         // Add selected class to clicked button
         colorBtn.classList.add('selected');

         // Update cap color
         const currentCap = store.store.caps.find(c => c.id === id);
         if (currentCap) {
            currentCap.color = color;
            detailsImage.style.background = color;
            await saveAppData();
         }
      };
   });

   // Initialize color carousel
   initColorCarousel();


   // Uncomment this if color swatches change
   /* colorPickerContainer.innerHTML = '';
   
   for (const palletName in ALL_CAP_COLORS) {
      const colorGroupDiv = document.createElement('div');
      colorGroupDiv.className = 'color-group';
   
      const palletLabel = document.createElement('label');
      palletLabel.textContent = palletName.replaceAll('_', ' ').replace('24', '').replace('UI', '').trim();
      colorGroupDiv.appendChild(palletLabel);
   
      const buttonsContainerDiv = document.createElement('div');
   
      ALL_CAP_COLORS[palletName].forEach(color => {
         const colorBtn = document.createElement('button');
         colorBtn.type = 'button';
         colorBtn.className = 'color-picker-btn';
         colorBtn.style.backgroundColor = color;
         colorBtn.title = color;
   
         // Mark as selected if it matches current cap color
         if (color === cap.color) {
            colorBtn.classList.add('selected');
         }
   
         colorBtn.onclick = async () => {
            // Update UI - remove selected class from all buttons
            colorPickerContainer.querySelectorAll('.color-picker-btn').forEach(btn => {
               btn.classList.remove('selected');
            });
   
            // Add selected class to clicked button
            colorBtn.classList.add('selected');
   
            // Update cap color
            const currentCap = store.store.caps.find(c => c.id === id);
            if (currentCap) {
               currentCap.color = color;
               detailsImage.style.background = color;
               await saveAppData();
            }
         };
   
         buttonsContainerDiv.appendChild(colorBtn);
      });
   
      colorGroupDiv.appendChild(buttonsContainerDiv);
      colorPickerContainer.appendChild(colorGroupDiv);
   } */

   pushTab('details');
}

function setupDetailsImageActions(capId) {
   const actionBar = document.querySelector('.image-actions');
   if (!actionBar) return;

   // Clear existing event listeners by cloning
   const newActionBar = actionBar.cloneNode(true);
   actionBar.parentNode.replaceChild(newActionBar, actionBar);

   const replaceBtn = newActionBar.querySelector('#replaceImageBtn');
   const cropBtn = newActionBar.querySelector('#cropImageBtn');
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

   if (cropBtn) {
      cropBtn.addEventListener('click', async () => {
         const success = await cropCapImage(capId);
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
         const id = li.dataset.id;
         const cap = store.store.caps.find(c => c.id === id);
         const match = !q || cap.title?.toLowerCase().includes(q) || cap.description?.toLowerCase().includes(q);
         li.style.display = match ? '' : 'none';
      });
   });
}

export function addLastCategoryToFilters() {
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
      li.querySelector(".cap-image-container img").alt = cap.title;
      li.querySelector(".cap-title").innerText = cap.title;
   });

   refreshGallery();
}
