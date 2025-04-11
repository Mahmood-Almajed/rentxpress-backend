const mongoose = require('mongoose');

// 💡 Inline brand-model mapping
const brandModelMap = {
  Toyota: ["Corolla", "Camry", "RAV4", "Highlander", "Yaris", "Prius", "Land Cruiser", "Fortuner", "Hilux", "Avalon", "Sequoia", "Tacoma", "4Runner", "Prado"],
  Honda: ["Civic", "Accord", "CR-V", "Pilot", "Fit", "Odyssey", "HR-V", "Jazz", "Insight", "Element", "Ridgeline"],
  Ford: ["Fusion", "Escape", "Focus", "Explorer", "Mustang", "Edge", "F-150", "Expedition", "Bronco", "Ranger", "Taurus"],
  Chevrolet: ["Malibu", "Equinox", "Tahoe", "Impala", "Cruze", "Traverse", "Suburban", "Camaro", "Silverado", "Blazer", "Trailblazer"],
  BMW: ["3 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X6", "X7", "M3", "M5", "i3", "i8", "Z4"],
  MercedesBenz: ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "GLS", "G-Class", "CLA", "SL-Class", "AMG GT"],
  Audi: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "TT", "RS5", "e-tron"],
  Volkswagen: ["Golf", "Jetta", "Passat", "Tiguan", "Atlas", "Touareg", "Beetle", "Polo"],
  Hyundai: ["Elantra", "Tucson", "Santa Fe", "Sonata", "Accent", "Palisade", "Kona", "Venue", "Creta", "Elentra-N"],
  Kia: ["Sorento", "Sportage", "Soul", "Optima", "Rio", "Seltos", "Telluride", "Carnival", "Cerato"],
  Nissan: ["Altima", "Sentra", "Rogue", "Pathfinder", "Tiida", "Micra", "Maxima", "Patrol", "X-Trail", "Juke", "Armada", "Navara"],
  Tesla: ["Model S", "Model 3", "Model X", "Model Y", "Roadster", "Cybertruck", "Semi"],
  Lexus: ["IS", "ES", "GS", "LS", "RX", "NX", "UX", "GX", "LX", "RC", "LC"],
  Mazda: ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-5", "CX-9", "MX-5 Miata", "RX-8"],
  Subaru: ["Impreza", "Outback", "Forester", "Crosstrek", "Legacy", "BRZ", "Ascent", "WRX"],
  Jeep: ["Wrangler", "Cherokee", "Compass", "Grand Cherokee", "Renegade", "Gladiator"],
  Dodge: ["Charger", "Challenger", "Durango", "Journey", "Dart", "Ram 1500"],
  GMC: ["Sierra", "Yukon", "Terrain", "Acadia", "Canyon", "Envoy"],
  Porsche: ["911", "Cayenne", "Macan", "Panamera", "Taycan", "Boxster"],
  LandRover: ["Range Rover", "Range Rover Sport", "Range Rover Velar", "Discovery", "Discovery Sport", "Defender", "Freelander"],
  Mitsubishi: ["Lancer", "Outlander", "Pajero", "Mirage", "ASX", "Eclipse Cross"]
};

// 👇 Embedded review schema
const reviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  carId: { type: mongoose.Schema.Types.ObjectId, ref: 'Car' },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
}, { timestamps: true });

// 👇 Main car schema
const carSchema = new mongoose.Schema({
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  brand: {
    type: String,
    enum: Object.keys(brandModelMap),
    required: true
  },
  model: {
    type: String,
    validate: {
      validator: function(value) {
        return brandModelMap[this.brand]?.includes(value);
      },
      message: props => `${props.value} is not a valid model for ${props.instance.brand}`
    }
  },

  type: {
    type: String,
    enum: ['SUV', 'Sedan', 'Truck', 'Off-Road', 'Convertible', 'Hatchback', 'Luxury', 'Electric', 'Sports', 'Van', 'Muscle', 'Coupe', 'Hybrid'],
  },

  year: {
    type: Number,
    enum: Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => 2000 + i),
    required: true
  },
  pricePerDay: { type: Number, min: 0 },
  location: { type: String },
  availability: { type: String, enum: ['available', 'rented', 'unavailable'], default: 'available' },
 // models/car.js
images: [
  {
    url: String,
    cloudinary_id: String,
  }
],
  isCompatible: { type: Boolean, default: false },
  forSale: { type: Boolean, default: false },
  salePrice: { type: Number, min: 0 },
  isSold: { type: Boolean, default: false },
  dealerPhone: { type: String },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  rentals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rental' }],
  reviews: [reviewSchema],
}, { timestamps: true });

const Car = mongoose.model('Car', carSchema);
module.exports = Car;
