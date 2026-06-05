import { slimSelectAfterChangeFunction } from '../data/gallery.js';

export function initGalleryCapColorPicker() {
   document.querySelectorAll('#colorPickerCategoryCapsSelect option').forEach(option => {
      const color = option.value;
      option.dataset.html = `<span class="color-swatch" style="background:${color}"></span>`;
   });

   const colorPicker = new SlimSelect({
      select: '#colorPickerCategoryCapsSelect',

      settings: {
         showSearch: false,
         allowDeselect: true,
         contentLocation: document.body,
         placeholderText: 'Set cap color'
      },

      events: {
         afterChange(newVal) {
            const selectedColor = newVal[0]?.value;
            if (slimSelectAfterChangeFunction && selectedColor) {
               slimSelectAfterChangeFunction(selectedColor)
            }
         }
      }
   });

   colorPicker.slimSelect = colorPicker.selectEl.nextSibling.classList.contains('ss-main') ? colorPicker.selectEl.nextSibling : null;
   colorPicker.slimSelect.setAttribute('hidden', 'hidden');
   return colorPicker;
}