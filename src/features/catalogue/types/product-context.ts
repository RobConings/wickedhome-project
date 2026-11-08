export type ProductContext = {
  productId: string;
  needs: { id: string; name: string; quantity: number; unit: string | null; listIds: string[] }[];
  tasks: { id: string; name: string; status: string }[];
  projects: { id: string; name: string; imageUrl: string | null }[];
};
