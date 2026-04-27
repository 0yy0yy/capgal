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
      this.onSelectionChange = options.onSelectionChange || (() => { });
      this.onSelectionModeChange = options.onSelectionModeChange || (() => { });
   }

   addSelectableItem(element, itemId) {
      const item = { element, id: itemId };
      this.selectableItems.push(item);

      let longPressTriggered = false;
      let startEvent = null;
      let timer = null;

      const start = (e) => {
         // Store the start event coordinates
         startEvent = e;
         longPressTriggered = false;

         timer = setTimeout(() => {
            longPressTriggered = true;
            this.startSelectionMode(item, e);
         }, this.longPressDelay);
      };

      const cancel = (e) => {
         if (timer) {
            clearTimeout(timer);
            timer = null;
         }

         // If long press wasn't triggered and we're in selection mode, handle click
         if (!longPressTriggered && this.isSelectionMode && e.type === 'pointerup') {
            this.toggleItemSelection(item, e);
         }

         startEvent = null;
      };

      const move = (e) => {
         // Cancel if moved too far from start
         if (startEvent) {
            const dx = Math.abs(e.clientX - startEvent.clientX);
            const dy = Math.abs(e.clientY - startEvent.clientY);
            if (dx > 10 || dy > 10) {
               clearTimeout(timer);
               timer = null;
            }
         }
      };

      element.addEventListener('pointerdown', start);
      element.addEventListener('pointerup', cancel);
      element.addEventListener('pointerleave', cancel);
      element.addEventListener('pointermove', move);

      // Prevent context menu
      element.addEventListener('contextmenu', (e) => e.preventDefault());
   }

   startSelectionMode(item, event) {
      if (!this.isSelectionMode) {
         this.isSelectionMode = true;
         this.onSelectionModeChange(true);
      }
      this.toggleItemSelection(item, event);
   }

   toggleItemSelection(item, event) {
      event?.preventDefault();

      if (this.selectedItems.has(item.id)) {
         this.selectedItems.delete(item.id);
         item.element.classList.remove('selected');
      } else {
         this.selectedItems.add(item.id);
         item.element.classList.add('selected');
      }

      this.onSelectionChange(Array.from(this.selectedItems));

      // Exit selection mode if no items selected
      if (this.selectedItems.size === 0 && this.isSelectionMode) {
         this.exitSelectionMode();
      }
   }

   exitSelectionMode() {
      this.isSelectionMode = false;
      this.selectedItems.clear();
      this.selectableItems.forEach(item => {
         item.element.classList.remove('selected');
      });
      this.onSelectionModeChange(false);
      this.onSelectionChange([]);
   }

   getSelectedItems() {
      return Array.from(this.selectedItems);
   }

   selectAll() {
      this.selectableItems.forEach(item => {
         if (!this.selectedItems.has(item.id)) {
            this.selectedItems.add(item.id);
            item.element.classList.add('selected');
         }
      });
      this.onSelectionChange(Array.from(this.selectedItems));
   }

   deselectAll() {
      this.exitSelectionMode();
   }
}

export default SelectionManager;
