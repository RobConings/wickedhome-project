import { api } from "@/lib/api-client";
import type { ProductContext } from "../types/product-context";
export const fetchProductContext = (id: string) => api.get<ProductContext>(`/catalogue/products/${encodeURIComponent(id)}/context`);
