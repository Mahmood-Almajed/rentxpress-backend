const mongoose = require('mongoose');


const reviewSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User'  },
    carId: { type: mongoose.Schema.Types.ObjectId, ref: 'Car' },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String },
  }, { timestamps: true });

const carSchema = new mongoose.Schema({
  dealerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  brand: {
    type: String,
    enum: [
      'Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW',
      'Mercedes-Benz', 'Audi', 'Volkswagen', 'Hyundai', 'Kia',
      'Nissan', 'Tesla', 'Lexus', 'Mazda', 'Subaru',
      'Jeep', 'Dodge', 'GMC', 'Porsche', 'Land Rover'
    ],
    required: true
  },
  model: { type: String },
  year: {
    type: Number,
    enum: Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => 2000 + i),
    required: true
  },
  pricePerDay: { type: Number ,min:0},
  location: { type: String },
  availability: { type: String, enum: ['available', 'rented', 'unavailable'], default: 'available' },
  image: {
    url: { type: String, required: true }, 
    cloudinary_id: { type: String, required: true }, 
  },
  isCompatible: { type: Boolean, default: false },

// listingType: {
//     type: String,
//     enum: ['sale', 'rent'],
//     required: true
//   },  
  forSale: { type: Boolean, default: false },            
  salePrice: { type: Number, min: 0 },                      
  isSold: { type: Boolean, default: false },                
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },


  rentals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rental' }],
  reviews: [reviewSchema],
}, { timestamps: true });

const Car = mongoose.model('Car', carSchema);
module.exports = Car;