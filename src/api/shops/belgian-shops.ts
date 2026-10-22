import type { ShopType } from "../lib/db";

export type CatalogShop = {
  /** Stable key; never change it once seeded, the seed updates shops by this key. */
  key: string;
  name: string;
  type: ShopType;
  websiteUrl: string;
  hasWebshop: boolean;
};

/**
 * Well-known shops in Belgium, seeded as the built-in catalogue. Households can add their own shops
 * next to these. Checked October 2026; chains do open, close and rebrand, so edit freely.
 */
export const BELGIAN_SHOPS: CatalogShop[] = [
  // Supermarkets
  { key: "colruyt", name: "Colruyt", type: "SUPERMARKET", websiteUrl: "https://www.colruyt.be", hasWebshop: false },
  { key: "delhaize", name: "Delhaize", type: "SUPERMARKET", websiteUrl: "https://www.delhaize.be", hasWebshop: true },
  { key: "carrefour", name: "Carrefour", type: "SUPERMARKET", websiteUrl: "https://www.carrefour.be", hasWebshop: true },
  { key: "albert-heijn", name: "Albert Heijn", type: "SUPERMARKET", websiteUrl: "https://www.ah.be", hasWebshop: true },
  { key: "aldi", name: "Aldi", type: "SUPERMARKET", websiteUrl: "https://www.aldi.be", hasWebshop: false },
  { key: "lidl", name: "Lidl", type: "SUPERMARKET", websiteUrl: "https://www.lidl.be", hasWebshop: true },
  { key: "okay", name: "OKay", type: "SUPERMARKET", websiteUrl: "https://www.okay.be", hasWebshop: false },
  { key: "spar", name: "Spar", type: "SUPERMARKET", websiteUrl: "https://www.spar.be", hasWebshop: false },
  { key: "intermarche", name: "Intermarché", type: "SUPERMARKET", websiteUrl: "https://www.intermarche.be", hasWebshop: false },
  { key: "jumbo", name: "Jumbo", type: "SUPERMARKET", websiteUrl: "https://www.jumbo.com", hasWebshop: false },
  { key: "bio-planet", name: "Bio-Planet", type: "SUPERMARKET", websiteUrl: "https://www.bioplanet.be", hasWebshop: false },
  { key: "collect-and-go", name: "Collect&Go", type: "ONLINE", websiteUrl: "https://www.collectandgo.be", hasWebshop: true },

  // Discount & variety
  { key: "action", name: "Action", type: "DISCOUNT", websiteUrl: "https://www.action.com/nl-be/", hasWebshop: false },
  { key: "hema", name: "HEMA", type: "DISCOUNT", websiteUrl: "https://www.hema.com/nl-be", hasWebshop: true },
  { key: "zeeman", name: "Zeeman", type: "DISCOUNT", websiteUrl: "https://www.zeeman.com/nl-be", hasWebshop: true },

  // Drugstores & pharmacies
  { key: "kruidvat", name: "Kruidvat", type: "DRUGSTORE", websiteUrl: "https://www.kruidvat.be", hasWebshop: true },
  { key: "di", name: "Di", type: "DRUGSTORE", websiteUrl: "https://www.di.be", hasWebshop: true },
  { key: "medi-market", name: "Medi-Market", type: "PHARMACY", websiteUrl: "https://www.medi-market.be", hasWebshop: true },
  { key: "multipharma", name: "Multipharma", type: "PHARMACY", websiteUrl: "https://www.multipharma.be", hasWebshop: true },

  // DIY & hardware
  { key: "gamma", name: "Gamma", type: "DIY", websiteUrl: "https://www.gamma.be", hasWebshop: true },
  { key: "brico", name: "Brico", type: "DIY", websiteUrl: "https://www.brico.be", hasWebshop: true },
  { key: "hubo", name: "Hubo", type: "DIY", websiteUrl: "https://www.hubo.be", hasWebshop: true },
  { key: "mr-bricolage", name: "Mr. Bricolage", type: "DIY", websiteUrl: "https://www.mr-bricolage.be", hasWebshop: true },

  // Garden & pets
  { key: "aveve", name: "Aveve", type: "GARDEN", websiteUrl: "https://www.aveve.be", hasWebshop: true },
  { key: "tom-and-co", name: "Tom&Co", type: "PETS", websiteUrl: "https://www.tomandco.be", hasWebshop: true },
  { key: "maxi-zoo", name: "Maxi Zoo", type: "PETS", websiteUrl: "https://www.maxizoo.be", hasWebshop: true },

  // Home & furnishing
  { key: "ikea", name: "IKEA", type: "HOME", websiteUrl: "https://www.ikea.com/be/nl/", hasWebshop: true },
  { key: "jysk", name: "JYSK", type: "HOME", websiteUrl: "https://jysk.be", hasWebshop: true },
  { key: "casa", name: "Casa", type: "HOME", websiteUrl: "https://www.casashops.com", hasWebshop: true },
  { key: "kwantum", name: "Kwantum", type: "HOME", websiteUrl: "https://www.kwantum.be", hasWebshop: true },

  // Electronics
  { key: "mediamarkt", name: "MediaMarkt", type: "ELECTRONICS", websiteUrl: "https://www.mediamarkt.be", hasWebshop: true },
  { key: "krefel", name: "Krëfel", type: "ELECTRONICS", websiteUrl: "https://www.krefel.be", hasWebshop: true },
  { key: "vanden-borre", name: "Vanden Borre", type: "ELECTRONICS", websiteUrl: "https://www.vandenborre.be", hasWebshop: true },
  { key: "fnac", name: "Fnac", type: "ELECTRONICS", websiteUrl: "https://www.fnac.be", hasWebshop: true },

  // Sports & fashion
  { key: "decathlon", name: "Decathlon", type: "SPORTS", websiteUrl: "https://www.decathlon.be", hasWebshop: true },

  // Online only
  { key: "bol", name: "bol", type: "ONLINE", websiteUrl: "https://www.bol.com/be/", hasWebshop: true },
  { key: "amazon-be", name: "Amazon.com.be", type: "ONLINE", websiteUrl: "https://www.amazon.com.be", hasWebshop: true },
  { key: "coolblue", name: "Coolblue", type: "ONLINE", websiteUrl: "https://www.coolblue.be", hasWebshop: true },
  { key: "zalando", name: "Zalando", type: "FASHION", websiteUrl: "https://www.zalando.be", hasWebshop: true },
  { key: "hellofresh", name: "HelloFresh", type: "ONLINE", websiteUrl: "https://www.hellofresh.be", hasWebshop: true },
];
