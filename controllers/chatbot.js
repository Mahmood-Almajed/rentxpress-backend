const express = require('express');
const router = express.Router();
const { Configuration, OpenAIApi } = require('openai');
const Car = require('../models/car');
const User = require('../models/user'); // still needed for getCarsByDealer

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const systemPrompt = `
You are RentBot, an AI assistant for RentXpress that helps users with car rentals and sales.
You MUST use function calls to fetch car data. Never guess or hallucinate.
Important:
- Mention total car count
- Use currency ($) and model years
- Highlight ♿ for special needs compatible cars
`;

const functions = [
  {
    name: "getAvailableCars",
    description: "Fetch cars filtered by brand, type, price, and accessibility",
    parameters: {
      type: "object",
      properties: {
        brand: { type: "string" },
        listingType: { type: "string", enum: ["rent", "sale"] },
        maxPrice: { type: "number" },
        isCompatible: {
          type: "boolean",
          description: "Only return cars compatible with special needs"
        },
        limit: { type: "number", default: 5 }
      }
    }
  },
  {
    name: "getExtremePricedCars",
    description: "Get the cheapest or most expensive car for rent or sale",
    parameters: {
      type: "object",
      properties: {
        listingType: { type: "string", enum: ["rent", "sale"] },
        sortOrder: { type: "string", enum: ["asc", "desc"] }
      },
      required: ["listingType", "sortOrder"]
    }
  },
  {
    name: "getCarsByDealer",
    description: "Get all cars listed by a specific dealer",
    parameters: {
      type: "object",
      properties: {
        dealerUsername: { type: "string" }
      },
      required: ["dealerUsername"]
    }
  }
];

const handleFunctionCall = async (name, args) => {
  if (name === "getAvailableCars") {
    const filter = { availability: 'available' };
    const listingType = args.listingType || 'both';

    if (args.maxPrice) {
      if (listingType === 'rent') {
        filter.pricePerDay = { $lte: args.maxPrice };
      } else if (listingType === 'sale') {
        filter.salePrice = { $lte: args.maxPrice };
      } else {
        filter.$or = [
          { pricePerDay: { $lte: args.maxPrice } },
          { salePrice: { $lte: args.maxPrice } }
        ];
      }
    }

    if (listingType === 'rent') {
      filter.forSale = false;
    } else if (listingType === 'sale') {
      filter.forSale = true;
      filter.isSold = false;
    } else {
      filter.$or = [
        { forSale: false },
        { forSale: true, isSold: false }
      ];
    }

    if (args.brand) {
      filter.brand = new RegExp(`^${args.brand}$`, 'i');
    }

    if (args.isCompatible === true) {
      filter.isCompatible = true;
    }

    const allCars = await Car.find(filter).populate('dealerId', 'username');
    const limit = args.limit ?? 5;
    const results = limit > 0 ? allCars.slice(0, limit) : allCars;

    return {
      total: allCars.length,
      cars: results.map(car => ({
        year: car.year,
        brand: car.brand,
        model: car.model,
        price: car.forSale ? car.salePrice : car.pricePerDay,
        type: car.forSale ? 'sale' : 'rent',
        dealerUsername: car.dealerId?.username || 'Unknown',
        dealerPhone: car.dealerPhone || 'N/A',
        isCompatible: car.isCompatible
      }))
    };
  }

  if (name === "getExtremePricedCars") {
    const { listingType, sortOrder } = args;
    const filter = {
      availability: 'available',
      forSale: listingType === 'sale',
      ...(listingType === 'sale' ? { isSold: false } : {})
    };
    const sortField = listingType === 'sale' ? 'salePrice' : 'pricePerDay';
    const sortOption = sortOrder === 'asc' ? 1 : -1;

    const car = await Car.findOne(filter).sort({ [sortField]: sortOption });
    if (!car) return { result: null };

    return {
      result: {
        year: car.year,
        brand: car.brand,
        model: car.model,
        price: car.forSale ? car.salePrice : car.pricePerDay,
        type: car.forSale ? 'sale' : 'rent',
        isCompatible: car.isCompatible
      }
    };
  }

  if (name === "getCarsByDealer") {
    const dealer = await User.findOne({ username: args.dealerUsername });

    if (!dealer) {
      return { total: 0, cars: [] };
    }

    const cars = await Car.find({ dealerId: dealer._id, availability: 'available' });

    return {
      total: cars.length,
      cars: cars.map(car => ({
        year: car.year,
        brand: car.brand,
        model: car.model,
        price: car.forSale ? car.salePrice : car.pricePerDay,
        type: car.forSale ? 'sale' : 'rent',
        isCompatible: car.isCompatible,
        dealerPhone: car.dealerPhone || 'N/A'
      }))
    };
  }

  return null;
};

router.post('/', async (req, res) => {
  const { message, history = [] } = req.body;

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message }
    ];

    const firstResponse = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo-1106',
      messages,
      functions,
      function_call: 'auto'
    });

    const choice = firstResponse.data.choices[0];
    const functionCall = choice.message.function_call;

    if (functionCall) {
      const args = JSON.parse(functionCall.arguments);
      const data = await handleFunctionCall(functionCall.name, args);

      const secondMessages = [
        ...messages,
        choice.message,
        {
          role: 'function',
          name: functionCall.name,
          content: JSON.stringify(data)
        }
      ];

      const secondResponse = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo-1106',
        messages: secondMessages
      });

      return res.json({
        reply: secondResponse.data.choices[0].message.content,
        history: [
          ...history,
          { role: 'user', content: message },
          choice.message,
          {
            role: 'function',
            name: functionCall.name,
            content: JSON.stringify(data)
          }
        ]
      });
    }

    return res.json({
      reply: choice.message.content,
      history: [...history, { role: 'user', content: message }, choice.message]
    });

  } catch (err) {
    console.error('Chatbot error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error processing request' });
  }
});

module.exports = router;
