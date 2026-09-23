export type Product = {
  id: string;
  title: string;
  seller: string;
  origin: string;
  geolocation: string;
  quantity: string;
  price: string;
  compliance: string;
  status: string;
  trace: string;
  route: string;
  description: string;
};

export const products: Product[] = [
  {
    id: "LOT-CR-081",
    title: "Cameroon Cocoa Beans",
    seller: "Mile 18 Cooperative",
    origin: "Bamenda Highlands, Cameroon",
    geolocation: "5.9723°, 10.0162°",
    quantity: "2,480 kg",
    price: "$3,420",
    compliance: "EUDR Verified",
    status: "Available",
    trace: "CAM-CCRT-24091",
    route: "Farm → Cross River → Export",
    description:
      "Single-origin Cameroon cocoa sourced from geofenced smallholder plots in the Bamenda Highlands, with full compliance records preserved from farm to export.",
  },
  {
    id: "LOT-CR-109",
    title: "Single-Origin Cocoa Nibs",
    seller: "Ngaoundal Cooperative",
    origin: "Adamawa Corridor, Cameroon",
    geolocation: "7.1005°, 13.6810°",
    quantity: "1,860 kg",
    price: "$2,740",
    compliance: "Due diligence complete",
    status: "Reserved",
    trace: "CAM-CCRT-24092",
    route: "Farm → Aggregator → Cross River",
    description:
      "Small-batch cocoa nibs originating from cooperative plots in Adamawa, carrying a complete chain-of-custody record and preserved origin evidence.",
  },
  {
    id: "LOT-CR-117",
    title: "Fair Trade Cocoa Powder",
    seller: "Ekondo Titi Aggregator",
    origin: "Southwest Cocoa Belt, Cameroon",
    geolocation: "4.2974°, 9.2401°",
    quantity: "3,120 kg",
    price: "$4,150",
    compliance: "EUDR Verified",
    status: "Available",
    trace: "CAM-CCRT-24093",
    route: "Farm → Warehouse → Export",
    description:
      "Fair trade cocoa powder processed from traceable Cameroonian origin plots, with full documentation from producer to final shipment record retained.",
  },
];

export const traceFlow = [
  {
    step: "Producer plot geofence",
    detail: "Farm and geolocation are registered in Cameroon with the production country locked to the record.",
    date: "Apr 08",
  },
  {
    step: "Certificate issued",
    detail: "The batch receives a trace certificate with the origin, plot, and compliance evidence attached.",
    date: "Apr 12",
  },
  {
    step: "Cross River transfer",
    detail: "The product moves through Cross River while retaining the Cameroon origin and all prior ownership data.",
    date: "Apr 17",
  },
  {
    step: "Export channel",
    detail: "The Nigerian exporter keeps the original production country and due-diligence record visible to buyers.",
    date: "Apr 22",
  },
];

export function getProductById(id: string) {
  return products.find((product) => product.id === id);
}
