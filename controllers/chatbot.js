const express = require('express');
const router = express.Router();
const { Configuration, OpenAIApi } = require('openai');
const Car = require('../models/car');
const User = require('../models/user');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const systemPrompt = `
You are RentBot, an AI assistant for RentXpress that helps users with car rentals and sales.
You MUST use function calls to fetch car data. Never guess or hallucinate.
Important:
- Mention total car count
- Use currency (BHD) or (BD) and model years
- Highlight ♿ for special needs compatible cars
- Always return clickable links using markdown [Click here](url)
- for the Mileage use "km" as the unit and separate thousands with a comma
- if the user wrote in arabic or any other language, respond in the same language
`;

const functions = [
  {
    name: "getAvailableCars",
    description: "Fetch cars filtered by brand, type, price, mileage, and accessibility",
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
        type: {
          type: "string",
          enum: ['SUV', 'Sedan', 'Truck', 'Off-Road', 'Convertible', 'Hatchback', 'Luxury', 'Electric', 'Sports', 'Van', 'Muscle', 'Coupe', 'Hybrid']
        },
        maxMileage: {
          type: "number",
          description: "Filter cars with mileage less than or equal to this"
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
  },
  {
    name: "listAllDealers",
    description: "List all dealers on the platform along with the cars they have listed and their contact numbers",
    parameters: {
      type: "object",
      properties: {}
    }
  }
];

const handleFunctionCall = async (name, args) => {
  const baseUrl = '/cars/';

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

    if (args.maxMileage) {
      filter.mileage = { $lte: args.maxMileage };
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

    if (args.type) {
      filter.type = args.type;
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
        id: car._id,
        year: car.year,
        brand: car.brand,
        model: car.model,
        mileage: car.mileage,
        price: car.forSale ? car.salePrice : car.pricePerDay,
        type: car.forSale ? 'sale' : 'rent',
        dealerUsername: car.dealerId?.username || 'Unknown',
        dealerPhone: car.dealerPhone || 'N/A',
        isCompatible: car.isCompatible,
        markdownLink: `[Click here to view car](${baseUrl}${car._id})`
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
        id: car._id,
        year: car.year,
        brand: car.brand,
        model: car.model,
        mileage: car.mileage,
        price: car.forSale ? car.salePrice : car.pricePerDay,
        type: car.forSale ? 'sale' : 'rent',
        isCompatible: car.isCompatible,
        dealerPhone: car.dealerPhone || 'N/A',
        markdownLink: `[Click here to view car](${baseUrl}${car._id})`
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
        id: car._id,
        year: car.year,
        brand: car.brand,
        model: car.model,
        mileage: car.mileage,
        price: car.forSale ? car.salePrice : car.pricePerDay,
        type: car.forSale ? 'sale' : 'rent',
        isCompatible: car.isCompatible,
        dealerPhone: car.dealerPhone || 'N/A',
        markdownLink: `[Click here to view car](${baseUrl}${car._id})`
      }))
    };
  }

  if (name === "listAllDealers") {
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://www.rentxpress.com/cars/'
      : '/cars/';

    const cars = await Car.find({}).populate('dealerId', 'username');
    const dealerMap = {};

    cars.forEach(car => {
      const username = car.dealerId?.username;
      if (!username) return;

      if (!dealerMap[username]) {
        dealerMap[username] = {
          cars: []
        };
      }

      const label = `[${car.brand} ${car.model}${car.isCompatible ? ' ♿' : ''} (${car.year}) - ${car.mileage} km](${baseUrl}${car._id}) — 📞 ${car.dealerPhone || 'N/A'}`;
      dealerMap[username].cars.push(label);
    });

    const formatted = Object.entries(dealerMap).map(([dealer, data], index) => {
      const carList = data.cars.map(car => `- ${car}`).join('\n');
      return `**${index + 1}. Dealer: ${dealer}**\n${carList}\n**Total cars: ${data.cars.length}**`;
    });

    return {
      formattedDealersList: formatted.join('\n\n'),
      totalDealers: Object.keys(dealerMap).length
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