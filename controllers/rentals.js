const express = require("express");
const verifyToken = require("../middleware/verify-token.js");
const isDealer = require("../middleware/is-dealer.js");
const isAdmin = require("../middleware/is-admin.js");
const { isValidObjectId } = require("mongoose");

const router = express.Router();

const Rentals = require("../models/rental.js");
const Car = require("../models/car.js");

// ========== Protected Routes =========
router.use(verifyToken);

// Create rental request (User only)
// Create rental request (User only)
router.post("/:carId", async (req, res) => {
  try {
    const { carId } = req.params;

    // Validate carId
    if (!isValidObjectId(carId)) {
      return res.status(400).json({ error: "Invalid car ID" });
    }

    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).json({ error: "Car not found" });
    }

    // 🛑 Reject if user already has a pending rental request for the same car
    const existingPending = await Rentals.findOne({
      userId: req.user._id,
      carId,
      status: "pending",
    });

    if (existingPending) {
      return res.status(400).json({
        error: "You already have a pending rental request for this car.",
      });
    }

    // Also reject if the car is already rented
    const existingApproved = await Rentals.findOne({
      carId,
      status: "approved",
    });

    if (existingApproved) {
      return res.status(400).json({ error: "Car is already rented." });
    }

    // Validate input
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    const userPhone = req.body.userPhone;

    const bahrainPhoneRegex =
      /^(\+973)?(3(20|21|22|23|80|81|82|83|84|87|88|89|9\d)\d{5}|33\d{6}|34[0-6]\d{5}|35(0|1|3|4|5)\d{5}|36\d{6}|37\d{6}|31\d{6}|66(3|6|7|8|9)\d{5}|6500\d{4}|1\d{7})$/;

    if (!userPhone || !bahrainPhoneRegex.test(userPhone)) {
      return res.status(400).json({ error: "Invalid Bahrain phone number." });
    }

    if (isNaN(startDate) || isNaN(endDate) || startDate > endDate) {
      return res.status(400).json({ error: "Invalid rental dates." });
    }

    const msInDay = 1000 * 60 * 60 * 24;
    const diff = Math.floor((endDate - startDate) / msInDay);
    const days = diff + 1;
    const totalPrice = days * car.pricePerDay;

    const rental = await Rentals.create({
      userId: req.user._id,
      carId,
      startDate,
      endDate,
      totalPrice,
      status: "pending",
      userPhone,
    });

    car.rentals.push(rental._id);
    await car.save();

    res.status(201).json(rental);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User cancels their own rental
router.put("/:rentalId/cancel", async (req, res) => {
  try {
    const rental = await Rentals.findById(req.params.rentalId).populate(
      "carId"
    );

    if (!rental || rental.userId.toString() !== req.user._id.toString()) {
      return res
        .status(404)
        .json({ message: "Rental not found or unauthorized." });
    }

    if (!["pending", "approved"].includes(rental.status)) {
      return res.status(400).json({
        message: "Only pending or approved rentals can be cancelled.",
      });
    }

    rental.status = "cancelled";
    await rental.save();

    const car = await Car.findById(rental.carId._id);
    car.availability = "available";
    await car.save();

    res.json({ message: "Rental cancelled.", rental });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user's rentals (User only)
router.get("/my-rentals", async (req, res) => {
  try {
    const rentals = await Rentals.find({ userId: req.user._id }).populate(
      "carId",
      "brand model year location images"
    );
    res.json(rentals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get rentals for dealer's cars (Dealer only)
router.get("/dealer-rentals", isDealer, async (req, res) => {
  try {
    const dealerCars = await Car.find({ dealerId: req.user._id }).select("_id");
    if (!dealerCars.length) {
      return res
        .status(404)
        .json({ message: "No cars found for this dealer." });
    }

    const carIds = dealerCars.map((car) => car._id);

    const rentals = await Rentals.find({ carId: { $in: carIds } })
      .populate("carId", "brand model year location")
      .populate("userId", "username");

    res.json(rentals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Approve, reject, or complete a rental (Dealer only)
router.put("/:rentalId/status", isDealer, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["approved", "rejected", "completed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid rental status." });
    }

    // Get rental and associated car
    const rental = await Rentals.findById(req.params.rentalId).populate(
      "carId"
    );
    if (
      !rental ||
      rental.carId.dealerId.toString() !== req.user._id.toString()
    ) {
      return res
        .status(404)
        .json({ message: "Rental not found or unauthorized." });
    }

    rental.status = status;
    await rental.save();

    const car = await Car.findById(rental.carId._id);

    if (status === "approved") {
      car.availability = "rented";

      // Reject other pending rentals for the same car
      await Rentals.updateMany(
        {
          carId: car._id,
          status: "pending",
          _id: { $ne: rental._id },
        },
        { $set: { status: "rejected" } }
      );
    } else if (status === "rejected" || status === "completed") {
      // If no other approved rentals exist for the car, set availability to 'available'
      const activeRental = await Rentals.findOne({
        carId: car._id,
        status: "approved",
        _id: { $ne: rental._id },
      });

      if (!activeRental) {
        car.availability = "available";
      }
    }

    await car.save();

    res.json({ message: `Rental ${status}.`, rental });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// dealer can delete a rental (dealer only)
router.delete("/:rentalId", isDealer, async (req, res) => {
  try {
    const rental = await Rentals.findById(req.params.rentalId);
    if (!rental) {
      return res.status(404).json({ message: "Rental not found." });
    }

    await Rentals.findByIdAndDelete(req.params.rentalId);
    res.status(200).json({ message: "Rental deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/all-rentals", isAdmin, async (req, res) => {
  try {
    const rentals = await Rentals.find()
      .populate({
        path: "carId",
        select: "brand model dealerId",
        populate: {
          path: "dealerId",
          select: "username",
        },
      })
      .populate("userId", "username");

    res.json(rentals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;
