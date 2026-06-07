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

      // Dragging variables
      this.isDragSelecting = false;
      this.lastHoveredItemId = null;
      this.dragSelectedIds = new Set();    // items selected in this gesture
      this.dragDeselectedIds = new Set();  // items deselected in this gesture

      this.exportSelectedCapImagesButton = document.getElementById("exportSelectedImagesBtn"); // Should I move this to gallery-selection.js instead?
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
         let dragSelectTriggered = false;  // ← track drag-select separately

         // Capture pointer so pointermove keeps firing even outside the element
         element.setPointerCapture(e.pointerId);

         timer = setTimeout(() => {
            longPressTriggered = true;
            this.startSelectionMode(item, e);
         }, this.longPressDelay);
      };

      const move = (e) => {
         if (!startEvent) return;

         const dx = Math.abs(e.clientX - startEvent.clientX);
         const dy = Math.abs(e.clientY - startEvent.clientY);
         if (dx <= 10 && dy <= 10) return;

         if (timer) {
            clearTimeout(timer);
            timer = null;
         }

         if (!this.isSelectionMode) {
            longPressTriggered = true;
            this.isDragSelecting = true;
            this.dragSelectedIds.clear();
            this.dragDeselectedIds.clear();
            this.startSelectionMode(item, e);
         }
      };

      const cancel = (e) => {
         if (timer) {
            clearTimeout(timer);
            timer = null;
         }

         startEvent = null;
         this.isDragSelecting = false;
         this.lastHoveredItemId = null;
         this.dragSelectedIds.clear();
         this.dragDeselectedIds.clear();

         if (!longPressTriggered && this.isSelectionMode && e.type === 'pointerup') {
            e.preventDefault();
            e.stopPropagation();
            justToggledSelection = true;
            this.toggleItemSelection(item, e);
         }
      };

      const onPointerEnter = (e) => {
         if (!this.isDragSelecting) return;

         // Same item as before — do nothing
         if (this.lastHoveredItemId === item.id) return;
         this.lastHoveredItemId = item.id;

         if (this.dragDeselectedIds.has(item.id)) {
            // Already deselected in this gesture — leave it alone
            return;
         }

         if (this.dragSelectedIds.has(item.id)) {
            // Already selected in this gesture — leave it alone
            return;
         }

         if (this.selectedItems.has(item.id)) {
            // Was selected before gesture — deselect it
            this.selectedItems.delete(item.id);
            item.element.classList.remove('selected');
            this.dragDeselectedIds.add(item.id);
         } else {
            // Not selected — select it
            this.selectedItems.add(item.id);
            item.element.classList.add('selected');
            this.dragSelectedIds.add(item.id);
         }

         this.onSelectionChange(Array.from(this.selectedItems));
         this.exportSelectedCapImagesButton.textContent =
            `Selected caps (${this.selectedItems.size})`;
      };

      const clickHandler = (e) => {
         // If we just toggled selection, prevent the click from opening details
         if (justToggledSelection) {
            e.preventDefault();
            e.stopPropagation();
            justToggledSelection = false;
            return;
         }
      };

      element.addEventListener('pointerdown', start);
      element.addEventListener('pointerup', cancel);
      //element.addEventListener('pointerleave', cancel);
      element.addEventListener('pointermove', move);
      element.addEventListener('click', clickHandler);

      // Prevent context menu
      element.addEventListener('contextmenu', (e) => e.preventDefault());
   }

   startSelectionMode(item, event) {
      if (!this.isSelectionMode) {
         this.isSelectionMode = true;
         this.onSelectionModeChange(true);
      }
      this.toggleItemSelection(item, event);

      this.exportSelectedCapImagesButton.textContent = `Selected caps (${this.selectedItems.size})`;
      this.exportSelectedCapImagesButton.removeAttribute("disabled");
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

      this.exportSelectedCapImagesButton.textContent = `Selected caps (${this.selectedItems.size})`;
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

      this.exportSelectedCapImagesButton.textContent = `Selected caps (${this.selectedItems.size})`;
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
      this.exportSelectedCapImagesButton.textContent = "Selected caps";
      this.exportSelectedCapImagesButton.setAttribute("disabled", "disabled");
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

      this.exportSelectedCapImagesButton.textContent = `Selected caps (${this.selectedItems.size})`;
   }

   deselectAll() {
      this.exitSelectionMode();
   }
}

export default SelectionManager;
