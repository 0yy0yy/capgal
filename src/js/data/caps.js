// ── Cap operations ─────────────────────────────────────────────────────────
import Modal from '../ui/modal.js';

export async function deleteCap(capId) {
   const confirmed = await Modal.confirm({
      question: 'Remove this cap from your collection? This cannot be undone.',
      yesLabel: 'Yes',
      noLabel: 'No',
   });

   if (!confirmed) return; // user said no or dismissed
   // TODO: Implement API call and UI update
}

export async function addCapsInBatch() {
   let keepAdding = true;

   while (keepAdding) {
      const result = await Modal.addItem({
         type: 'cap',
         categories: [],
      });

      if (!result) break; // user cancelled → stop the loop

      // Handle multiple files mode
      if (result.isMultiple && result.files && result.files.length > 0) {
         const totalFiles = result.files.length;

         // Process each selected file
         for (let i = 0; i < result.files.length; i++) {
            const file = result.files[i];

            // Pre-load the image into the modal
            Modal.setPendingImage(file);

            // Open modal for each file to let user set category/description
            const capData = await Modal.addItem({
               type: 'cap',
               categories: [],
            });

            if (!capData) {
               // User cancelled on this file - ask if they want to continue with remaining
               const remaining = result.files.length - i - 1;
               if (remaining > 0) {
                  const continueAdding = await Modal.confirm({
                     question: `Skip this image? You have ${remaining} more to go.`,
                     yesLabel: 'Skip this one',
                     noLabel: 'Cancel all',
                  });
                  if (!continueAdding) break;
               }
               continue;
            }

            // Image is already set from pendingImage in modal
            // TODO: Implement saveCap(capData)
            console.log(`Adding cap (${i + 1}/${totalFiles}):`, file.name, capData);
         }
         break; // Done with batch
      }

      // TODO: Implement saveCap(result)
      console.log('Adding single cap:', result);

      keepAdding = await Modal.confirm({
         question: 'Cap added! Do you want to add another one?',
         yesLabel: 'Add another',
         noLabel: 'Done',
      });
   }
}
