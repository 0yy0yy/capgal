// ── Cap operations ─────────────────────────────────────────────────────────
import Modal from '../ui/modal.js';
import * as store from './store.js';
import { saveAppData } from './saving.js';
import { processCapImage } from './image-processor.js';
import { openGallery } from './gallery.js';
import { getWordForCount, tryHeicConversion, clampToPalette, showLoadingScreen, updateLoadingScreen, hideLoadingScreen } from '../helpers/helper.js';
import * as camera from '../camera/camera.js';

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
      showLoadingScreen('Saving cap to database...');

      let imageBase64 = null;
      let capColor = '#808080';

      if (capData.image) {
         //updateLoadingScreen('Converting image format...');
         //const convertedJpegImage = await tryHeicConversion(capData.image);

         //updateLoadingScreen('Processing image...');
         const processed = await processCapImage(convertedJpegImage);

         updateLoadingScreen('Encoding image...');
         imageBase64 = await fileToBase64(processed.imageBlob);
         capColor = clampToPalette(processed.capColor);
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
      hideLoadingScreen();
      return newCap;
   } catch (error) {
      console.error('Error saving cap:', error);
      hideLoadingScreen();
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
               noLabel: 'No, done',
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
            question: `Add titles for ${totalFiles} ${getWordForCount(totalFiles, 'cap')} now?\n(or add them later individually)`,
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
                        question: `${remaining} ${getWordForCount(remaining, 'images')} left. Continue?`,
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
            question: `Added ${addedCount} ${getWordForCount(addedCount, 'cap')}!`,
            yesLabel: 'OK'
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
   // Show modal asking user to choose source
   const choice = await Modal.confirm({
      headerText: 'Choose action',
      question: 'Where would you like to get the new image from?',
      yesLabel: 'Device Storage',
      noLabel: 'Take Photo',
   });

   // noLabel is clicked = take photo
   // yesLabel is clicked = device storage
   // null = cancelled

   let imageFile = null;

   try {
      if (choice === true) {
         // Device storage
         const input = document.createElement('input');
         input.type = 'file';
         input.accept = 'image/*';

         imageFile = await new Promise((resolve) => {
            input.addEventListener('change', (e) => {
               resolve(e.target.files?.[0] || null);
            });
            input.click();
         });
      } else if (choice === false) {
         // Take photo with camera
         try {
            const capturedBlob = await camera.showCameraModal();
            imageFile = capturedBlob;
         } catch (error) {
            console.error('Camera error:', error);
            alert('Could not access camera. Please check permissions.');
            return false;
         }
      } else {
         // User cancelled
         return false;
      }

      if (!imageFile) {
         return false;
      }

      showLoadingScreen('Processing image...');
      updateLoadingScreen('Converting format...');

      const convertedJpegImage = await tryHeicConversion(imageFile);

      updateLoadingScreen('Detecting cap circle...');
      const processed = await processCapImage(convertedJpegImage);

      updateLoadingScreen('Encoding image...');
      const imageBase64 = await fileToBase64(processed.imageBlob);

      const cap = store.store.caps.find(c => c.id === capId);
      if (cap) {
         cap.imageBase64 = imageBase64;
         cap.color = clampToPalette(processed.capColor);
         cap.updatedAt = new Date().toISOString();
      }

      await saveAppData();

      // Refresh gallery to show updated image immediately
      openGallery(store.currentCategory); // PROBLEM - todo: this adds additional stack on the navstac but it should replace the gallery and details wuth the new ones to not repeat navigation on going back the nav stack
      hideLoadingScreen();
      return true;
   } catch (error) {
      console.error('Error replacing image:', error);
      hideLoadingScreen();
      return false;
   }
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
