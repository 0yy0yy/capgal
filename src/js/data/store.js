// ── Dummy cap data ────────────────────────────────────────────────────────
export const caps = Array.from({ length: 12 }, (_, i) => ({
   id: i,
   tag: `CAP-${String(i).padStart(3, '0')}`,
   description: ['New Era 59FIFTY', 'Vintage Snapback', 'Dad Hat', 'Trucker Cap'][i % 4],
   category: ['all', 'blue', 'red', 'vintage'][i % 4],
   color: ['#4a90d9', '#e25c5c', '#7bc67a', '#c8a96e', '#9b6fd4', '#5bc8ac'][i % 6],
}));

// ── State ──────────────────────────────────────────────────────────────────
export let currentCategory = 'all';
export let settingsOpen = false;
export let navStack = ['categories'];

// ── Export state setters ───────────────────────────────────────────────────
export function setCurrentCategory(category) {
   currentCategory = category;
}

export function setSettingsOpen(isOpen) {
   settingsOpen = isOpen;
}

export function setNavStack(stack) {
   navStack = stack;
}

export function getNavStackTop() {
   return navStack[navStack.length - 1];
}

export function getNavStackBehind() {
   return navStack[navStack.length - 2] || null;
}
