export function init() {
   const searchButton = document.getElementById("searchButton")
   const addCategoryButton = document.getElementById("addCategoryButton")
   const addCapButton = document.getElementById("addCapButton")
   const settingsButton = document.getElementById("settingsButton")

   //searchButton.addEventListener("click")
   //addCategoryButton.addEventListener("click")
   addCapButton.addEventListener("click", addCap)
   settingsButton.addEventListener("click", openSettings)
}

export function searchGallery(searchString) {
   console.log("searchGallery", searchString)
}

export function addCategory(categoryName) {
   console.log("addCategory", categoryName)
}

export function addCap() {
   console.log("addCap")
}

export function openSettings() {
   console.log("openSettings")
}

export function closeSettings() {
   console.log("closeSettings")
}

export function openDetails() {
   console.log("openDetails")
}

export function closeDetails() {
   console.log("closeDetails")
}

export function openGallery() {
   console.log("openGallery")
}

export function closeGallery() {
   console.log("closeGallery")
}