/**
 * SelectionManager – Handles multi-selection and long-press selection mode
 * Works with any list of elements that you want to make selectable
 */
export class SelectionManager {
   constructor(options = {}) {
      this.selectableItems = [];
      this.selectedItems = new Set();
      this.isSelectionMode = false;
      this.longPressTimer = null;
      this.longPressDelay = options.delay || 350;
      this.lastSelectedIndex = -1;
      this.onSelectionChange = options.onSelectionChange || (() => { });
      this.onSelectionModeChange = options.onSelectionModeChange || (() => { });
      this.container = options.container || document.body; // Add container option

      // Dragging variables
      this.isDragSelecting = false;
      this.lastHoveredItemId = null;
      this.dragSelectedIds = new Set();    // items selected in this gesture
      this.dragDeselectedIds = new Set();  // items deselected in this gesture
      this.initialDragSelectionState = null; // Track if we started selecting or deselecting
      this.isSelecting = true; // Whether we're selecting or deselecting during drag

      this.exportSelectedCapImagesButton = document.getElementById("exportSelectedImagesBtn");

      // Bind global move handler
      this.globalMoveHandler = this.handleGlobalMove.bind(this);
      this.globalUpHandler = this.handleGlobalUp.bind(this);
   }

   addSelectableItem(element, itemId) {
      const item = { element, id: itemId };
      this.selectableItems.push(item);

      let longPressTriggered = false;
      let startEvent = null;
      let timer = null;
      let justToggledSelection = false;

      const start = (e) => {
         if (e.touches && e.touches.length > 1) return;

         startEvent = { clientX: e.clientX, clientY: e.clientY };
         longPressTriggered = false;
         justToggledSelection = false;

         element.setPointerCapture(e.pointerId);

         // Start long press timer
         timer = setTimeout(() => {
            longPressTriggered = true;
            this.startSelectionMode(item, e);
         }, this.longPressDelay);
      };

      const move = (e) => {
         if (!startEvent) return;

         const dx = Math.abs(e.clientX - startEvent.clientX);
         const dy = Math.abs(e.clientY - startEvent.clientY);

         // Movement detected - cancel long press and possibly start drag select
         if (dx > 10 || dy > 10) {
            if (timer) {
               clearTimeout(timer);
               timer = null;
            }

            // Only start drag select if we're already in selection mode
            if (this.isSelectionMode && !longPressTriggered && !this.isDragSelecting) {
               this.startDragSelect(e, item);
            }
         }
      };

      const cancel = (e) => {
         if (timer) {
            clearTimeout(timer);
            timer = null;
         }

         startEvent = null;

         if (!longPressTriggered && this.isSelectionMode && e.type === 'pointerup') {
            e.preventDefault();
            e.stopPropagation();
            justToggledSelection = true;
            this.toggleItemSelection(item, e);
         }
      };

      const onPointerEnter = (e) => {
         if (!this.isDragSelecting) return;

         // Update selection based on drag mode
         this.updateItemSelectionDuringDrag(item);
      };

      const clickHandler = (e) => {
         if (justToggledSelection) {
            e.preventDefault();
            e.stopPropagation();
            justToggledSelection = false;
            return;
         }
      };

      element.addEventListener('pointerdown', start);
      element.addEventListener('pointerup', cancel);
      element.addEventListener('pointermove', move, { passive: false });
      element.addEventListener('click', clickHandler);
      element.addEventListener('pointerenter', onPointerEnter);
      element.addEventListener('contextmenu', (e) => e.preventDefault());
   }

   startDragSelect(event, startItem) {
      this.isDragSelecting = true;
      this.dragSelectedIds.clear();
      this.dragDeselectedIds.clear();

      // Determine if we're in select or deselect mode based on the starting item
      this.isSelecting = !this.selectedItems.has(startItem.id);

      // Initialize with the starting item
      if (this.isSelecting && !this.selectedItems.has(startItem.id)) {
         this.selectedItems.add(startItem.id);
         startItem.element.classList.add('selected');
         this.dragSelectedIds.add(startItem.id);
      } else if (!this.isSelecting && this.selectedItems.has(startItem.id)) {
         this.selectedItems.delete(startItem.id);
         startItem.element.classList.remove('selected');
         this.dragDeselectedIds.add(startItem.id);
      }

      this.lastHoveredItemId = startItem.id;
      this.onSelectionChange(Array.from(this.selectedItems));
      this.updateExportButtonText();

      // Add global listeners for move and up events
      window.addEventListener('pointermove', this.globalMoveHandler);
      window.addEventListener('pointerup', this.globalUpHandler);
   }

   handleGlobalMove(e) {
      if (!this.isDragSelecting) return;

      // Find the element under the cursor
      const elementUnderCursor = document.elementsFromPoint(e.clientX, e.clientY);

      // Find the first selectable item under the cursor
      for (let el of elementUnderCursor) {
         const selectableItem = this.selectableItems.find(item => item.element === el || item.element.contains(el));
         if (selectableItem) {
            if (this.lastHoveredItemId !== selectableItem.id) {
               this.lastHoveredItemId = selectableItem.id;
               this.updateItemSelectionDuringDrag(selectableItem);
            }
            break;
         }
      }
   }

   handleGlobalUp(e) {
      if (this.isDragSelecting) {
         this.isDragSelecting = false;
         this.lastHoveredItemId = null;
         this.dragSelectedIds.clear();
         this.dragDeselectedIds.clear();

         // Remove global listeners
         window.removeEventListener('pointermove', this.globalMoveHandler);
         window.removeEventListener('pointerup', this.globalUpHandler);
      }
   }

   updateItemSelectionDuringDrag(item) {
      // Skip if already processed in this drag gesture
      if (this.dragSelectedIds.has(item.id) || this.dragDeselectedIds.has(item.id)) return;

      if (this.isSelecting && !this.selectedItems.has(item.id)) {
         // Select the item
         this.selectedItems.add(item.id);
         item.element.classList.add('selected');
         this.dragSelectedIds.add(item.id);
      } else if (!this.isSelecting && this.selectedItems.has(item.id)) {
         // Deselect the item
         this.selectedItems.delete(item.id);
         item.element.classList.remove('selected');
         this.dragDeselectedIds.add(item.id);
      }

      this.onSelectionChange(Array.from(this.selectedItems));
      this.updateExportButtonText();
   }

   startSelectionMode(item, event) {
      if (!this.isSelectionMode) {
         this.isSelectionMode = true;
         this.onSelectionModeChange(true);
      }
      this.toggleItemSelection(item, event);
      this.updateExportButtonText();
   }

   toggleItemSelection(item, event) {
      event?.preventDefault();

      // Check if shift key is held and we have a previous selection
      if (event?.shiftKey && this.lastSelectedIndex !== -1) {
         const currentIndex = this.selectableItems.findIndex(i => i.id === item.id);
         this.selectRange(this.lastSelectedIndex, currentIndex);
      } else {
         // Normal toggle behavior
         if (this.selectedItems.has(item.id)) {
            this.selectedItems.delete(item.id);
            item.element.classList.remove('selected');
         } else {
            this.selectedItems.add(item.id);
            item.element.classList.add('selected');

            // Update last selected index only if item was selected
            const currentIndex = this.selectableItems.findIndex(i => i.id === item.id);
            this.lastSelectedIndex = currentIndex;
         }
      }

      this.onSelectionChange(Array.from(this.selectedItems));
      this.updateExportButtonText();
   }

   selectRange(startIndex, endIndex) {
      // Normalize indices
      const min = Math.min(startIndex, endIndex);
      const max = Math.max(startIndex, endIndex);

      // Select all items in the range
      for (let i = min; i <= max; i++) {
         const item = this.selectableItems[i];
         if (item) {
            this.selectedItems.add(item.id);
            item.element.classList.add('selected');
         }
      }

      // Update last selected index
      this.lastSelectedIndex = endIndex;
      this.updateExportButtonText();
   }

   exitSelectionMode() {
      this.isSelectionMode = false;
      this.selectedItems.clear();
      this.lastSelectedIndex = -1;
      this.selectableItems.forEach(item => {
         item.element.classList.remove('selected');
      });
      this.onSelectionModeChange(false);
      this.onSelectionChange([]);
      this.updateExportButtonText(true); // Disable button
   }

   getSelectedItems() {
      return Array.from(this.selectedItems);
   }

   selectAll() {
      // Ensure we're in selection mode
      if (!this.isSelectionMode) {
         this.isSelectionMode = true;
         this.onSelectionModeChange(true);
      }

      this.selectableItems.forEach(item => {
         if (!this.selectedItems.has(item.id) && !item.element.classList.contains('hidden')) {
            this.selectedItems.add(item.id);
            item.element.classList.add('selected');
         }
      });
      this.onSelectionChange(Array.from(this.selectedItems));
      this.updateExportButtonText();
   }

   deselectAll() {
      this.exitSelectionMode();
   }

   updateExportButtonText(disable = false) {
      if (!this.exportSelectedCapImagesButton) return;

      if (disable || this.selectedItems.size === 0) {
         this.exportSelectedCapImagesButton.textContent = "Selected caps";
         this.exportSelectedCapImagesButton.setAttribute("disabled", "disabled");
      } else {
         this.exportSelectedCapImagesButton.textContent = `Selected caps (${this.selectedItems.size})`;
         this.exportSelectedCapImagesButton.removeAttribute("disabled");
      }
   }
}

export default SelectionManager;