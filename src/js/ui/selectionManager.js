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
   }

   addSelectableItem(element, itemId) {
      const item = { element, id: itemId };
      this.selectableItems.push(item);

      let longPressTriggered = false;
      let startEvent = null;
      let timer = null;
      let justToggledSelection = false;

      const start = (e) => {
         // Ignore multi-touch events (e.g., pinch zoom, two-finger gestures)
         if (e.touches && e.touches.length > 1) {
            return;
         }

         // Store the start event coordinates
         startEvent = e;
         longPressTriggered = false;
         justToggledSelection = false;

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
            justToggledSelection = true;
            this.toggleItemSelection(item, e);
            // Prevent click event from firing after this
            e.preventDefault();
            e.stopPropagation();
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
      element.addEventListener('pointerleave', cancel);
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
   }

   deselectAll() {
      this.exitSelectionMode();
   }
}

export default SelectionManager;
