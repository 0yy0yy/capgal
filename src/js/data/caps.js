// ── Cap operations ─────────────────────────────────────────────────────────
import Modal from '../ui/modal.js';
import * as store from './store.js';
import { saveAppData } from './saving.js';
import { processCapImage } from './image-processor.js';
import { openGallery } from './gallery.js';

/**
 * Delete a cap from collection (with confirmation)
 */
export async function deleteCap(capId) {
   const confirmed = await Modal.confirm({
      question: 'Remove this cap from your collection? This cannot be undone.',
      yesLabel: 'Yes, delete',
      noLabel: 'Cancel',
   });

   if (confirmed) {
      store.store.caps = store.store.caps.filter(c => c.id !== capId);
      await saveAppData();
      return true;
   }
   return false;
}

/**
 * Convert File/Blob to Base64
 */
function fileToBase64(file) {
   return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
   });
}

/**
 * Save a single cap
 */
export async function saveCap(capData) {
   try {
      let imageBase64 = null;
      let capColor = '#808080';

      if (capData.image) {
         // Process image with OpenCV
         const processed = await processCapImage(capData.image);
         imageBase64 = await fileToBase64(processed.imageBlob);
         capColor = processed.capColor;
      }

      // Add to store
      const newCap = {
         id: Date.now(),
         title: capData.title || '',
         description: capData.description || '',
         category: capData.category || 'all', // Default to 'all' if not specified
         imageBase64,
         color: capColor,
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
      };

      store.store.caps.push(newCap);

      // If new category was created, add it to store
      if (capData.newCategory) {
         store.store.categories.push(capData.newCategory);
      }

      await saveAppData();
      return newCap;
   } catch (error) {
      console.error('Error saving cap:', error);
      throw error;
   }
}

/**
 * Batch add multiple caps
 */
export async function addCapsInBatch() {
   let keepAdding = true;

   while (keepAdding) {
      const result = await Modal.addItem({
         type: 'cap',
         categories: store.store.categories,
      });

      if (!result) break; // user cancelled

      // Single cap mode
      if (!result.isMultiple) {
         try {
            await saveCap(result);
            // Refresh gallery
            openGallery(store.currentCategory);

            keepAdding = await Modal.confirm({
               question: 'Cap added! Add another?',
               yesLabel: 'Yes',
               noLabel: 'Done',
            });
         } catch (error) {
            console.error('Error adding cap:', error);
            await Modal.confirm({
               question: 'Failed to add cap.',
               yesLabel: 'Try again',
               noLabel: 'Cancel',
            }).then(retry => {
               if (!retry) keepAdding = false;
            });
         }
      }
      // Multiple files mode
      else if (result.files && result.files.length > 0) {
         const totalFiles = result.files.length;
         let addedCount = 0;

         // Ask if user wants to add details now or later
         const addDetailsNow = await Modal.confirm({
            question: `Add titles for ${totalFiles} caps now?\n(or add them later individually)`,
            yesLabel: 'Add now',
            noLabel: 'Add later',
         });

         for (let i = 0; i < result.files.length; i++) {
            const file = result.files[i];

            if (addDetailsNow) {
               // Pre-load and ask for details for each
               Modal.setPendingImage(file);
               const capData = await Modal.addItem({
                  type: 'cap',
                  categories: store.store.categories,
               });

               if (!capData) {
                  const remaining = result.files.length - i - 1;
                  if (remaining > 0) {
                     const continueAdding = await Modal.confirm({
                        question: `${remaining} images left. Continue?`,
                        yesLabel: 'Yes',
                        noLabel: 'No',
                     });
                     if (!continueAdding) break;
                  }
                  continue;
               }

               try {
                  await saveCap(capData);
                  addedCount++;
               } catch (error) {
                  console.error('Error adding cap:', error);
               }
            } else {
               // Just add with minimal details
               try {
                  await saveCap({
                     image: file,
                     title: file.name.replace(/\.[^/.]+$/, ''),
                     description: '',
                     category: 'all',
                  });
                  addedCount++;
               } catch (error) {
                  console.error('Error adding cap:', error);
               }
            }
         }

         // Show summary and refresh
         await Modal.confirm({
            question: `Added ${addedCount} caps!`,
            yesLabel: 'OK',
            noLabel: null,
         });

         // Refresh gallery
         openGallery(store.currentCategory);
         break; // Done with batch
      }
   }
}

/**
 * Replace cap image
 */
export async function replaceCapImage(capId) {
   const input = document.createElement('input');
   input.type = 'file';
   input.accept = 'image/*';

   return new Promise((resolve) => {
      input.addEventListener('change', async (e) => {
         const file = e.target.files?.[0];
         if (!file) {
            resolve(false);
            return;
         }

         try {
            const processed = await processCapImage(file);
            const imageBase64 = await fileToBase64(processed.imageBlob);

            const cap = store.store.caps.find(c => c.id === capId);
            if (cap) {
               cap.imageBase64 = imageBase64;
               cap.color = processed.capColor;
               cap.updatedAt = new Date().toISOString();
            }

            await saveAppData();
            // Refresh gallery to show updated image immediately
            openGallery(store.currentCategory);
            resolve(true);
         } catch (error) {
            console.error('Error replacing image:', error);
            resolve(false);
         }
      });

      input.click();
   });
}

/**
 * Export cap image to device
 */
export async function exportCapImage(capId) {
   const cap = store.store.caps.find(c => c.id === capId);
   if (!cap || !cap.imageBase64) return false;

   try {
      const blob = new Blob([Uint8Array.from(atob(cap.imageBase64), c => c.charCodeAt(0))], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cap.title || 'cap'}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
   } catch (error) {
      console.error('Error exporting image:', error);
      return false;
   }
}

/**
 * Delete cap image (but keep cap record)
 */
export async function deleteCapImage(capId) {
   const confirmed = await Modal.confirm({
      question: 'Delete the image for this cap?',
      yesLabel: 'Yes, delete',
      noLabel: 'Cancel',
   });

   if (confirmed) {
      const cap = store.store.caps.find(c => c.id === capId);
      if (cap) {
         cap.imageBase64 = null;
         cap.updatedAt = new Date().toISOString();
      }
      await saveAppData();
      return true;
   }
   return false;
}
