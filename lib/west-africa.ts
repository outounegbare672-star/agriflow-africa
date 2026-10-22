export const westAfricanCountries = [
  { code: "BJ", name: "Bénin", currency: "XOF", currencyName: "Franc CFA BCEAO" },
  { code: "BF", name: "Burkina Faso", currency: "XOF", currencyName: "Franc CFA BCEAO" },
  { code: "CV", name: "Cabo Verde", currency: "CVE", currencyName: "Escudo cap-verdien" },
  { code: "CI", name: "Côte d’Ivoire", currency: "XOF", currencyName: "Franc CFA BCEAO" },
  { code: "GM", name: "Gambie", currency: "GMD", currencyName: "Dalasi gambien" },
  { code: "GH", name: "Ghana", currency: "GHS", currencyName: "Cedi ghanéen" },
  { code: "GN", name: "Guinée", currency: "GNF", currencyName: "Franc guinéen" },
  { code: "GW", name: "Guinée-Bissau", currency: "XOF", currencyName: "Franc CFA BCEAO" },
  { code: "LR", name: "Liberia", currency: "LRD", currencyName: "Dollar libérien" },
  { code: "ML", name: "Mali", currency: "XOF", currencyName: "Franc CFA BCEAO" },
  { code: "MR", name: "Mauritanie", currency: "MRU", currencyName: "Ouguiya mauritanienne" },
  { code: "NE", name: "Niger", currency: "XOF", currencyName: "Franc CFA BCEAO" },
  { code: "NG", name: "Nigeria", currency: "NGN", currencyName: "Naira nigérian" },
  { code: "SN", name: "Sénégal", currency: "XOF", currencyName: "Franc CFA BCEAO" },
  { code: "SL", name: "Sierra Leone", currency: "SLE", currencyName: "Leone" },
  { code: "TG", name: "Togo", currency: "XOF", currencyName: "Franc CFA BCEAO" },
] as const;

export type WestAfricanCountry = (typeof westAfricanCountries)[number];

export function getWestAfricanCountry(code: string): WestAfricanCountry | undefined {
  return westAfricanCountries.find((country) => country.code === code);
}
