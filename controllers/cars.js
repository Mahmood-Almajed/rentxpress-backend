const express = require('express');
const verifyToken = require('../middleware/verify-token.js');
const isDealer = require('../middleware/is-dealer.js');
const isAdmin = require('../middleware/is-admin.js');
const Car = require('../models/car.js');
const upload = require('../config/multer.js'); // your Cloudinary + multer config


const router = express.Router();

// ========== Public Routes ===========

// Get all cars (public)
router.get('/', async (req, res) => {
    try {
        const cars = await Car.find({}).populate('dealerId', 'username').sort({ createdAt: 'desc' });
        res.status(200).json(cars);
    } catch (error) {
        res.status(500).json(error);
    }
});

// Get a car by ID (public)
router.get('/:carId', async (req, res) => {
    try {
        const car = await Car.findById(req.params.carId).populate('reviews.userId', 'username');
        res.status(200).json(car);
    } catch (error) {
        res.status(500).json(error);
    }
});

// ========== Protected Routes =========
router.use(verifyToken);

// Add a car (Dealer only)
router.post('/', isDealer, upload.single('image'), async (req, res) => {
    try {
      console.log('Uploaded file:', req.file);
  
      if (!req.file) {
        return res.status(400).json({ message: "Image is required." });
      }
  
      const car = await Car.create({
        dealerId: req.user._id,
        brand: req.body.brand,
        model: req.body.model,
        year: req.body.year,
        pricePerDay: req.body.pricePerDay,
        location: req.body.location,
        image: {
          url: req.file.path,
          cloudinary_id: req.file.filename,
        },
      });
  
      res.status(201).json(car);
    } catch (error) {
      console.error('Car creation failed:', error);
      res.status(500).json({ message: 'Failed to create car', error: error.message });
    }
  });
  


// Edit car by ID (Dealer only)
router.put('/:carId', isDealer, upload.single('image'), async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);
    if (!car) return res.status(404).json({ message: 'Car not found' });

    // Authorization check
    if (req.user.role !== 'admin' && car.dealerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // If a new image is uploaded, delete the old one from Cloudinary
    if (req.file && car.image?.cloudinary_id) {
      const cloudinary = require('../config/cloudinary');
      await cloudinary.uploader.destroy(car.image.cloudinary_id);
    }

    // Prepare updated data
    const updatedData = {
      brand: req.body.brand,
      model: req.body.model,
      year: req.body.year,
      pricePerDay: req.body.pricePerDay,
      location: req.body.location,
    };

    if (req.file) {
      updatedData.image = {
        url: req.file.path,
        cloudinary_id: req.file.filename,
      };
    }

    const updatedCar = await Car.findByIdAndUpdate(req.params.carId, updatedData, { new: true });
    res.status(200).json(updatedCar);
  } catch (error) {
    console.error('Car update failed:', error);
    res.status(500).json({ message: 'Failed to update car', error: error.message });
  }
});


// Delete a car (Dealer or Admin)
router.delete('/:carId', verifyToken, async (req, res) => {
    try {
        const car = await Car.findById(req.params.carId);

        // Only allow the car's dealer or an admin to delete
        if (req.user.role !== 'admin' && car.dealerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "Unauthorized: You can only delete your own cars unless you're an admin." });
        }

        await Car.findByIdAndDelete(req.params.carId);
        res.status(200).json({ message: "Car deleted successfully." });
    } catch (error) {
        res.status(500).json(error);
    }
});

// Add a review to a car (User must be logged in)
router.post('/:carId/reviews', verifyToken, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const carId = req.params.carId;

        const car = await Car.findById(carId);
        if (!car) {
            return res.status(404).json({ message: 'Car not found' });
        }

        const review = { userId: req.user._id, carId, rating, comment };
        car.reviews.push(review);
        await car.save();

        res.status(201).json(car);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a review (User or Admin)
router.delete('/:carId/reviews/:reviewId', verifyToken, async (req, res) => {
    try {
        const car = await Car.findById(req.params.carId);
        if (!car) {
            return res.status(404).json({ message: 'Car not found' });
        }

        const review = car.reviews.id(req.params.reviewId);

        // Only allow the review's author or an admin to delete
        if (!review || (req.user.role !== 'admin' && review.userId.toString() !== req.user._id.toString())) {
            return res.status(403).json({ error: "Unauthorized: You can only delete your own reviews unless you're an admin." });
        }

        car.reviews.pull(review._id);
await car.save();
        res.status(200).json({ message: 'Review deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;