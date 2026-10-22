// Public API of the inventory feature. Routes, the app frame and other features import from here only.
//
// For Places: `<PlaceStockSection placeId />` (content only; wrap it in the place page's card).
export { PlaceStockSection } from "./components/place-stock-section";
export {
  inventoryAction,
  inventoryLoader,
  productStockLoader,
  scanLoader,
  type InventoryPageData,
  type ProductStockPageData,
  type ScanPageData,
} from "./data/inventory-loaders";
export { fetchStock } from "./data/inventory-requests";
export { InventoryScreen } from "./screens/inventory-screen";
export { ProductStockScreen } from "./screens/product-stock-screen";
export { ScanScreen } from "./screens/scan-screen";
export {
  SCAN_MODES,
  canChangeStock,
  canManageStock,
  type ScanMode,
  type StockItem,
  type StockMovement,
} from "./types/inventory";
