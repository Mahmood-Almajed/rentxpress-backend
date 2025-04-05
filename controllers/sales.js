const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verify-token');
const isDealer = require('../middleware/is-dealer');
const isAdmin = require('../middleware/is-admin');

const Sale = require('../models/sale');
const Car = require('../models/car');

// =============================
// Buy a Car (User only)
// POST /api/sales/:carId/buy
// =============================
router.post('/:carId/buy', verifyToken, async (req, res) => {
  try {
    const car = await Car.findById(req.params.carId);

    if (!car || !car.forSale || car.isSold) {
      return res.status(400).json({ message: 'Car not available for sale' });
    }

    if (car.dealerId.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Dealers cannot buy their own cars.' });
    }

    // Update car state
    car.isSold = true;
    car.forSale = false;
    car.buyerId = req.user._id;
    car.availability = 'unavailable';
    await car.save();

    // Create Sale record
    const sale = await Sale.create({
      carId: car._id,
      dealerId: car.dealerId,
      buyerId: req.user._id,
      salePrice: car.salePrice,
      paymentStatus: 'paid',
      soldAt: new Date(),
    });

    res.status(200).json({ message: 'Car purchased successfully.', sale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================
// Get All Sales (Admin: all, Dealer: own, User: purchases)
// GET /api/sales/
// ===========================================
router.get('/', verifyToken, async (req, res) => {
  try {
    let filter = {};

    if (req.user.role === 'dealer') {
      filter = { dealerId: req.user._id };
    } else if (req.user.role === 'user') {
      filter = { buyerId: req.user._id };
    }

    const sales = await Sale.find(filter)
      .populate('carId', 'brand model image')
      .populate('dealerId', 'username')
      .populate('buyerId', 'username');

    res.status(200).json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================
// Get Single Sale Record (Dealer, Buyer, Admin)
// GET /api/sales/:saleId
// ===========================================
router.get('/:saleId', verifyToken, async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.saleId)
      .populate('carId', 'brand model image')
      .populate('dealerId', 'username')
      .populate('buyerId', 'username');

    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    const isBuyer = sale.buyerId._id.toString() === req.user._id.toString();
    const isDealer = sale.dealerId._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isBuyer && !isDealer && !isAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.status(200).json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================
// Admin: Get Sales Stats (Optional Add-on)
// GET /api/sales/stats
// ===========================================
router.get('/stats/admin', [verifyToken, isAdmin], async (req, res) => {
  try {
    const totalSales = await Sale.countDocuments();
    const totalRevenue = await Sale.aggregate([
      { $group: { _id: null, revenue: { $sum: "$salePrice" } } }
    ]);

    res.json({
      totalSales,
      totalRevenue: totalRevenue[0]?.revenue || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
