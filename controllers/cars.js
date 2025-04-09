const express = require('express');
const verifyToken = require('../middleware/verify-token.js');
const isDealer = require('../middleware/is-dealer.js');
const isAdmin = require('../middleware/is-admin.js');
const Car = require('../models/car.js');
const upload = require('../config/multer.js');

const router = express.Router();
const cloudinary = require('../config/cloudinary');

// ========== Public Routes ===========

router.get('/', async (req, res) => {
  try {
    const cars = await Car.find({}).populate('dealerId', 'username').sort({ createdAt: 'desc' });
    res.status(200).json(cars);
  } catch (error) {
    res.status(500).json(error);
  }
});

router.get('/:carId', async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId)
      .populate('reviews.userId', 'username')
      .populate('dealerId', 'username');
    res.status(200).json(car);
  } catch (error) {
    res.status(500).json(error);
  }
});

// ========== Protected Routes =========
router.use(verifyToken);

// Create Car
router.post('/', isDealer, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one image is required." });
    }

    const {
      brand,
      model,
      year,
      location,
      pricePerDay,
      salePrice,
      listingType,
      isCompatible,
      isSold,
      buyerId,
      dealerPhone
    } = req.body;

    const images = req.files.map(file => ({
      url: file.path,
      cloudinary_id: file.filename,
    }));

    const car = await Car.create({
      dealerId: req.user._id,
      brand,
      model,
      year: parseInt(year),
      location,
      pricePerDay: listingType === 'rent' ? parseFloat(pricePerDay) : undefined,
      salePrice: listingType === 'sale' ? parseFloat(salePrice) : undefined,
      forSale: listingType === 'sale',
      isSold: isSold === 'true',
      buyerId: isSold === 'true' ? buyerId || null : null,
      isCompatible: isCompatible === 'true',
      dealerPhone,
      images,
    });

    res.status(201).json(car);
  } catch (error) {
    console.error('Car creation failed:', error);
    res.status(500).json({ message: 'Failed to create car', error: error.message });
  }
});

// Update Car
router.put('/:carId', isDealer, upload.array('images', 5), async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);
    if (!car) return res.status(404).json({ message: 'Car not found' });

    if (req.user.role !== 'admin' && car.dealerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const {
      brand,
      model,
      year,
      location,
      pricePerDay,
      salePrice,
      listingType,
      isCompatible,
      isSold,
      buyerId,
      dealerPhone
    } = req.body;

    // 🔥 Remove old images if new ones uploaded
    if (req.files && req.files.length > 0) {
      if (car.images && car.images.length > 0) {
        for (const img of car.images) {
          if (img.cloudinary_id) {
            await cloudinary.uploader.destroy(img.cloudinary_id);
          }
        }
      }

      car.images = req.files.map(file => ({
        url: file.path,
        cloudinary_id: file.filename,
      }));
    }

    Object.assign(car, {
      brand,
      model,
      year: parseInt(year),
      location,
      pricePerDay: listingType === 'rent' ? parseFloat(pricePerDay) : undefined,
      salePrice: listingType === 'sale' ? parseFloat(salePrice) : undefined,
      forSale: listingType === 'sale',
      isSold: isSold === 'true',
      buyerId: isSold === 'true' ? buyerId || null : null,
      isCompatible: isCompatible === 'true',
      dealerPhone,
    });

    await car.save();
    res.status(200).json(car);
  } catch (error) {
    console.error('Car update failed:', error);
    res.status(500).json({ message: 'Failed to update car', error: error.message });
  }
});

// Delete Car
router.delete('/:carId', verifyToken, async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);

    if (req.user.role !== 'admin' && car.dealerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Unauthorized: You can only delete your own cars unless you're an admin." });
    }

    // Delete associated images from Cloudinary
    for (let img of car.images) {
      await cloudinary.uploader.destroy(img.cloudinary_id);
    }

    await Car.findByIdAndDelete(req.params.carId);
    res.status(200).json({ message: "Car deleted successfully." });
  } catch (error) {
    res.status(500).json(error);
  }
});

// Add Review
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

// Delete Review
router.delete('/:carId/reviews/:reviewId', verifyToken, async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);
    if (!car) {
      return res.status(404).json({ message: 'Car not found' });
    }

    const review = car.reviews.id(req.params.reviewId);
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
