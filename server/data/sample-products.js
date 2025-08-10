// Hardcoded sample products for Amazon purchase integration
// These products are manually curated and their data is verified

export const SAMPLE_PRODUCTS = [
  {
    asin: "amazon:B0CC916NW7",
    name: "Resistance Bands with Handles",
    price: 19.99,
    url: "https://www.amazon.com/Exercise-Resistance-Handles-Workouts-Included/dp/B0CC916NW7",
    imageUrl: "https://m.media-amazon.com/images/I/71lsCRKShkL._AC_SL1500_.jpg",
  },
  {
    asin: "amazon:B0FB7D5PHW",
    name: "STANLEY ProTour Flip Straw Tumbler",
    price: 35.0,
    url: "https://www.amazon.com/Quencher-Leakproof-Compatible-Insulated-Stainless/dp/B0FB7D5PHW",
    imageUrl: "https://m.media-amazon.com/images/I/51fyKEXIv5L._AC_SL1500_.jpg",
  },
  {
    asin: "amazon:B01LR5S6HK",
    name: "Amazon Neoprene Dumbbell Hand Weights",
    price: 21.99,
    url: "https://www.amazon.com/AmazonBasics-Pound-Neoprene-Dumbbells-Weights/dp/B01LR5S6HK",
    imageUrl: "https://m.media-amazon.com/images/I/81Y26toqdTL._AC_SL1500_.jpg",
  },
];

// Shipping information from environment variables
export const SHIPPING = {
  name: process.env.SHIPPING_NAME || "Your Name",
  address1: process.env.SHIPPING_ADDRESS1 || "Your Address Line 1",
  address2: process.env.SHIPPING_ADDRESS2 || "",
  city: process.env.SHIPPING_CITY || "Your City",
  state: process.env.SHIPPING_STATE || "Your State",
  postalCode: process.env.SHIPPING_POSTAL_CODE || "Your Postal Code",
  country: process.env.SHIPPING_COUNTRY || "US",
  email: process.env.SHIPPING_EMAIL || "your_email@example.com",
};

// Helper function to find product by ASIN
export const findProductByAsin = (asin) => {
  return SAMPLE_PRODUCTS.find((product) => product.asin === asin);
};

// Helper function to validate ASIN format
export const isValidAsin = (asin) => {
  const asinRegex = /^amazon:B[0-9A-Z]{9}$/;
  return asinRegex.test(asin);
};
