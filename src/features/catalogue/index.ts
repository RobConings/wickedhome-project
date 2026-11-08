// Product identity/CRUD remains backed by the existing catalogue records and validated shopping service.
export { ProductsScreen, productsLoader, productsAction, fetchProduct, fetchProducts } from "@/features/shopping";
export { ProductContextPanels } from "./components/product-context-panels";
export { fetchProductContext } from "./data/catalogue-requests";
