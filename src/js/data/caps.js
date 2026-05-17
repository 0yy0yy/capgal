// ── Cap operations ─────────────────────────────────────────────────────────
import Modal from '../ui/modal.js';
import * as store from './store.js';
import { saveAppData } from './saving.js';
import { processCapImage } from './image-processor.js';
import { openGallery, refreshGallery } from './gallery.js';
import { getWordForCount, tryHeicConversion, clampToPalette, showLoadingScreen, updateLoadingScreen, hideLoadingScreen } from '../helpers/helper.js';
import * as camera from '../camera/camera.js';
import { showImageCropper } from '../ui/image-cropper.js';

/**
 * Delete a cap from collection (with confirmation)
 */
export async function deleteCap(capId, showConfirmation = true) {
   let confirmed = true;
   if (showConfirmation) {
      confirmed = await Modal.confirm({
         question: 'Remove this cap from your collection? This cannot be undone.',
         yesLabel: 'Yes, delete',
         noLabel: 'Cancel',
      });
   }

   if (confirmed) {
      store.store.caps = store.store.caps.filter(c => c.id !== capId);
      await saveAppData();
      return true;
   }
   return false;
}

/**
 * Delete selected caps from collection (with confirmation)
 */
export async function deleteSelectedCaps(capIds) {
   const numberOfCapsSelected = capIds.length;
   const confirmed = await Modal.confirm({
      question: `Remove ${numberOfCapsSelected} selected ${getWordForCount(numberOfCapsSelected, 'cap')} from your collection? This cannot be undone.`,
      yesLabel: 'Yes, delete',
      noLabel: 'Cancel',
   });

   if (confirmed) {
      try {
         showLoadingScreen(`Deleting ${numberOfCapsSelected} cap(s)...`);

         // Use for...of instead of forEach with async/await
         for (const capId of capIds) {
            try {
               const status = await deleteCap(capId, false);
               if (!status) {
                  console.warn(`Failed to delete cap with ID: ${capId}`);
               }
            } catch (error) {
               console.error(`Error deleting cap ${capId}:`, error);
            }
         }

         hideLoadingScreen();
         return true;
      } catch (error) {
         hideLoadingScreen();
         console.error('Error deleting selected caps:', error);
         await Modal.confirm({
            question: 'There was a problem when trying to delete the selected caps',
            yesLabel: 'OK'
         });
         return false;
      }
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
      let processed = null;

      try {
         if (!capData.imageProcessed) {
            updateLoadingScreen('Converting format...');
            const convertedJpegImage = await tryHeicConversion(capData.image);

            updateLoadingScreen(`Detecting bottle cap in image '${capData.title}'...`);
            processed = await processCapImage(convertedJpegImage);
         }
      } catch {
         updateLoadingScreen('FAILED to process the image, using the original one...');
      }

      updateLoadingScreen('Encoding image...');
      const img = processed ? processed.imageBlob : capData.image;
      const color = processed ? processed.capColor : capData.capColor;
      imageBase64 = await fileToBase64(img);
      capColor = clampToPalette(color || '#808080');

      // Add to store
      const newCap = {
         id: String(Date.now()),
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
   } finally {
      hideLoadingScreen();
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

         showLoadingScreen('Processing images...');

         for (let i = 0; i < totalFiles; i++) {
            const file = result.files[i];

            if (addDetailsNow) {
               // Pre-load and ask for details for each
               await Modal.setPendingImage(file);
               const capData = await Modal.addItem({
                  type: 'cap',
                  categories: store.store.categories,
                  headerText: `Add Cap (${i + 1}/${totalFiles})`,
                  hideBatchButton: true
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

         hideLoadingScreen();

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

   let imageFile = null;

   try {
      if (choice === true) { // yesLabel: 'Device Storage'
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
      } else if (choice === false) { // noLabel: 'Take Photo'
         // Take photo with camera
         try {
            const capturedBlob = await camera.showCameraModal();
            imageFile = capturedBlob;
         } catch (error) {
            console.error('Camera error:', error);
            alert('Could not access camera. Please check permissions.');
            return false;
         }
      } else { // User cancelled
         return false;
      }

      if (!imageFile) {
         return false;
      }

      showLoadingScreen('Processing image...');
      updateLoadingScreen('Converting format...');

      const convertedJpegImage = await tryHeicConversion(imageFile);

      const fileName = imageFile.name ? imageFile.name : String(Date.now());
      updateLoadingScreen(`Detecting bottle cap in image '${fileName}'...`);
      const processed = await processCapImage(convertedJpegImage); // add the source to know if it is in bgr... --- todo

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
      refreshGallery(); //openGallery(store.currentCategory); // PROBLEM - todo: this adds additional stack on the navstac but it should replace the gallery and details wuth the new ones to not repeat navigation on going back the nav stack
      return true;
   } catch (error) {
      console.error('Error replacing image:', error);
      return false;
   } finally {
      hideLoadingScreen();
   }
}

/**
 * Export cap image to device
 */
export async function exportCapImage(capId) {
   const cap = store.store.caps.find(c => c.id === capId);
   if (!cap || !cap.imageBase64) return false;

   try {
      const blob = new Blob([Uint8Array.from(atob(cap.imageBase64), c => c.charCodeAt(0))], { type: 'image/png' });
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

/**
 * Crop cap image
 */
export async function cropCapImage(capId) {
   const cap = store.store.caps.find(c => c.id === capId);
   if (!cap || !cap.imageBase64) return false;

   try {
      showLoadingScreen('Opening image cropper...');

      // Show the image cropper
      const croppedBlob = await showImageCropper(`data:image/jpeg;base64,${cap.imageBase64}`);

      if (!croppedBlob) {
         // User cancelled
         hideLoadingScreen();
         return false;
      }

      updateLoadingScreen('Processing cropped image...');
      const imageBase64 = await fileToBase64(croppedBlob);

      // Update the cap with the cropped image
      cap.imageBase64 = imageBase64;
      cap.updatedAt = new Date().toISOString();

      await saveAppData();
      hideLoadingScreen();
      return true;
   } catch (error) {
      console.error('Error cropping image:', error);
      hideLoadingScreen();
      return false;
   }
}
