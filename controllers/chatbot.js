const express = require("express");
const router = express.Router();
const { Configuration, OpenAIApi } = require("openai");
const Car = require("../models/car");
const User = require("../models/user");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const classifyIntent = async (userInput) => {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-1106",
    messages: [
      {
        role: "system",
        content: `You are a filter. Decide if this input is irrelevant for a car rental platform. Block things like math (e.g. 1+1 or even if he asked about something like this between allowed message), weather, AI trivia, jokes, and fun facts. Allow anything else including platform questions like 'how to become a dealer'. Respond ONLY with {"decision":"allowed"} or {"decision":"blocked"}.`,
      },
      {
        role: "user",
        content: userInput,
      },
    ],
    functions: [
      {
        name: "setIntent",
        parameters: {
          type: "object",
          properties: {
            decision: {
              type: "string",
              enum: ["allowed", "blocked"],
            },
          },
          required: ["decision"],
        },
      },
    ],
    function_call: { name: "setIntent" },
  });

  const args = JSON.parse(
    response.data.choices[0].message.function_call.arguments
  );
  return args.decision;
};

const systemPrompt = (user) => `
You are CarBot, an AI assistant for CarXpress that helps users and dealers with car rentals and sales.
You MUST use function calls to fetch car data. If a user asks for a car "for 6 people" or "for a large family", interpret that as a request for a larger car type (like SUV or Van).
Never guess or hallucinate.

Important:
- Mention total car count
- Format prices using BD or BHD:
  • For rentals, show as "BD XX per day"
  • For sales, show as "BD XX,XXX"
- Highlight ♿ for special needs compatible cars
- Always return clickable links using markdown [Click here](url)
- For the Mileage use "km" as the unit and separate thousands with a comma

User Info:
- Role: ${user?.role || "guest"}
- Username: ${user?.username || "N/A"}

If the user wants to sell, list, or upload a car, they must become an approved dealer first suggest that if the user asked you e.g. i want to sell my car or something related to selling cars. 
But if the user is searching to buy a car (e.g. "cars for sale", "I want to buy a car", "I want a car for sale"), do NOT treat it as a seller — instead, show available cars that are for sale.And the input should be not case sensitive (it doesn't matter).

Example reply: "To sell a car on CarXpress, you first need to become an approved dealer. Please visit the 'Become a Dealer' page and submit your request. Once approved, you'll be able to list your vehicles for sale."
`;

const getFrontendCarLink = (car, user) => {
  const base = (
    process.env.FRONTEND_BASE_URL || "http://localhost:5173"
  ).replace(/\/+$/, "");
  const isDealer =
    user?.role === "dealer" && String(car.dealerId) === String(user._id);
  return `${base}${isDealer ? `/dealer/cars/${car._id}` : `/cars/${car._id}`}`;
};

const functions = [
  {
    name: "getAvailableCars",
    description:
      "Fetch cars filtered by brand, type, price, mileage, and accessibility",
    parameters: {
      type: "object",
      properties: {
        brand: { type: "string" },
        listingType: { type: "string", enum: ["rent", "sale"] },
        maxPrice: { type: "number" },
        isCompatible: { type: "boolean" },
        type: {
          type: "string",
          enum: [
            "SUV",
            "Sedan",
            "Truck",
            "Off-Road",
            "Convertible",
            "Hatchback",
            "Luxury",
            "Electric",
            "Sports",
            "Van",
            "Muscle",
            "Coupe",
            "Hybrid",
          ],
        },
        maxMileage: { type: "number" },
        limit: { type: "number", default: 5 },
      },
    },
  },
  {
    name: "getExtremePricedCars",
    description: "Get the cheapest or most expensive car for rent or sale",
    parameters: {
      type: "object",
      properties: {
        listingType: { type: "string", enum: ["rent", "sale"] },
        sortOrder: { type: "string", enum: ["asc", "desc"] },
      },
      required: ["listingType", "sortOrder"],
    },
  },
  {
    name: "getCarsByDealer",
    description: "Get all cars listed by a specific dealer",
    parameters: {
      type: "object",
      properties: {
        dealerUsername: { type: "string" },
      },
      required: ["dealerUsername"],
    },
  },
  {
    name: "listAllDealers",
    description:
      "List all dealers on the platform along with the cars they have listed and their contact numbers",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "getMyCars",
    description: "Fetch all cars listed by the currently logged-in dealer",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

const handleFunctionCall = async (name, args, user, message) => {
  if (name === "getAvailableCars") {
    const filter = { availability: "available" };
    const listingType = args.listingType || "both";

    if (args.maxPrice) {
      if (listingType === "rent") {
        filter.pricePerDay = { $lte: args.maxPrice };
      } else if (listingType === "sale") {
        filter.salePrice = { $lte: args.maxPrice };
      } else {
        filter.$or = [
          { pricePerDay: { $lte: args.maxPrice } },
          { salePrice: { $lte: args.maxPrice } },
        ];
      }
    }

    if (args.maxMileage) filter.mileage = { $lte: args.maxMileage };

    if (listingType === "rent") filter.forSale = false;
    else if (listingType === "sale") {
      filter.forSale = true;
      filter.isSold = false;
    } else {
      filter.$or = [{ forSale: false }, { forSale: true, isSold: false }];
    }

    if (args.brand) filter.brand = new RegExp(`^${args.brand}$`, "i");
    if (args.type) filter.type = args.type;
    if (args.isCompatible === true) filter.isCompatible = true;
    const msg = message.toLowerCase();

    // Precise match only for seat numbers
const vanMatch = /(8|9|10|eight|nine|ten)[ -]?(people|persons|seater|seat)/i.test(msg);
const suvMatch = /(6|7|six|seven)[ -]?(people|persons|seater|seat)/i.test(msg);


    if (vanMatch) {
      filter.type = "Van";
    } else if (suvMatch) {
      filter.type = "SUV";
    } else if (
      !args.type &&
      msg.includes("family trip") &&
      !vanMatch &&
      !suvMatch
    ) {
      filter.type = "SUV";
    }

    const allCars = await Car.find(filter).populate("dealerId", "username");
    const limit = args.limit ?? 5;
    const results = limit > 0 ? allCars.slice(0, limit) : allCars;

    return {
      total: allCars.length,
      cars: results.map((car) => ({
        id: car._id,
        year: car.year,
        brand: car.brand,
        model: car.model,
        mileage: car.mileage,
        price: car.forSale
          ? `BHD ${car.salePrice.toLocaleString()}`
          : `BHD ${car.pricePerDay} per day`,
        type: car.forSale ? "sale" : "rent",

        dealerUsername: car.dealerId?.username || "Unknown",
        dealerPhone: car.dealerPhone || "N/A",
        isCompatible: car.isCompatible,
        markdownLink: `[Click here to view car](${getFrontendCarLink(
          car,
          user
        )})`,
      })),
    };
  }

  if (name === "getExtremePricedCars") {
    const { listingType, sortOrder } = args;
    const filter = {
      availability: "available",
      forSale: listingType === "sale",
      ...(listingType === "sale" ? { isSold: false } : {}),
    };
    const sortField = listingType === "sale" ? "salePrice" : "pricePerDay";
    const sortOption = sortOrder === "asc" ? 1 : -1;

    const car = await Car.findOne(filter).sort({ [sortField]: sortOption });
    if (!car) return { result: null };

    return {
      result: {
        id: car._id,
        year: car.year,
        brand: car.brand,
        model: car.model,
        mileage: car.mileage,
        price: car.forSale
          ? `BHD ${car.salePrice.toLocaleString()}`
          : `BHD ${car.pricePerDay} per day`,

        isCompatible: car.isCompatible,
        dealerPhone: car.dealerPhone || "N/A",
        markdownLink: `[Click here to view car](${getFrontendCarLink(
          car,
          user
        )})`,
      },
    };
  }

  if (name === "getCarsByDealer") {
    const dealer = await User.findOne({ username: args.dealerUsername });
    if (!dealer) return { total: 0, cars: [] };

    const cars = await Car.find({
      dealerId: dealer._id,
      availability: "available",
    });

    return {
      total: cars.length,
      cars: cars.map((car) => ({
        id: car._id,
        year: car.year,
        brand: car.brand,
        model: car.model,
        mileage: car.mileage,
        price: car.forSale
          ? `BHD ${car.salePrice.toLocaleString()}`
          : `BHD ${car.pricePerDay} per day`,
        isCompatible: car.isCompatible,
        dealerPhone: car.dealerPhone || "N/A",
        markdownLink: `[Click here to view car](${getFrontendCarLink(
          car,
          user
        )})`,
      })),
    };
  }

  if (name === "getMyCars") {
    if (!user || user.role !== "dealer") {
      return { error: "Only dealers can view their own car listings." };
    }

    const cars = await Car.find({ dealerId: user._id });

    return {
      total: cars.length,
      cars: cars.map((car) => ({
        id: car._id,
        year: car.year,
        brand: car.brand,
        model: car.model,
        mileage: car.mileage,
        price: car.forSale
          ? `BHD ${car.salePrice.toLocaleString()}`
          : `BHD ${car.pricePerDay} per day`,
        isCompatible: car.isCompatible,
        dealerPhone: car.dealerPhone || "N/A",
        markdownLink: `[Click here to view car](${getFrontendCarLink(
          car,
          user
        )})`,
      })),
    };
  }

  if (name === "listAllDealers") {
    const cars = await Car.find({}).populate("dealerId", "username");
    const dealerMap = {};

    cars.forEach((car) => {
      const username = car.dealerId?.username;
      if (!username) return;

      if (!dealerMap[username]) {
        dealerMap[username] = { cars: [] };
      }

      const label = `[${car.brand} ${car.model}${
        car.isCompatible ? " ♿" : ""
      } (${car.year}) - ${car.mileage} km](${getFrontendCarLink(
        car,
        user
      )}) — 📞 ${car.dealerPhone || "N/A"}`;
      dealerMap[username].cars.push(label);
    });

    const formatted = Object.entries(dealerMap).map(([dealer, data], index) => {
      const carList = data.cars.map((car) => `- ${car}`).join("\n");
      return `**${index + 1}. Dealer: ${dealer}**\n${carList}\n**Total cars: ${
        data.cars.length
      }**`;
    });

    return {
      formattedDealersList: formatted.join("\n\n"),
      totalDealers: Object.keys(dealerMap).length,
    };
  }

  return null;
};

//  POST /chatbot
router.post("/", async (req, res) => {
  const { message, history = [], user } = req.body;

  const decision = await classifyIntent(message);
  if (decision === "blocked") {
    return res.json({
      reply: ` I'm here to help with car rentals, purchases, dealer info, and platform support. Please ask something related to those.`,
      history,
    });
  }
  const normalized = message.toLowerCase().trim();

  if (
    /\b(become a dealer|how to become a dealer|register as dealer|dealer application|dealer signup)\b/.test(
      normalized
    )
  ) {
    return res.json({
      reply: `To become a dealer on CarXpress:\n\n1. Go to the "Become a Dealer" page from the main navigation menu.\n2. Fill in the required personal and contact information.\n3. Submit your application.\n4. Once approved, you will be able to log in as a dealer and list cars for sale or rent.\n\nLet me know if you need help finding the form!`,
      history,
    });
  }

  if (
    normalized.includes("list my cars") ||
    normalized.includes("how to list a car") ||
    normalized.includes("add my car")
  ) {
    return res.json({
      reply: `To list your car:\n\n1. Log in to your dealer account.\n2. Navigate to "My Cars" from the menu.\n3. Click "Add New Car".\n4. Fill in all car details and upload photos.\n5. Submit the form to make your listing live.`,
      history,
    });
  }

  if (
    normalized.includes("view my rentals") ||
    normalized.includes("my bookings") ||
    normalized.includes("rental history")
  ) {
    return res.json({
      reply: `To view your rental history:\n\n1. Log in to your user account.\n2. Go to the "My Rentals" section from the main menu.\n3. Here, you'll see all your rental requests, their status, and details.`,
      history,
    });
  }

  try {
    const messages = [
      { role: "system", content: systemPrompt(user) },
      ...history,
      { role: "user", content: message },
    ];

    const firstResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-1106",
      messages,
      functions,
      function_call: "auto",
    });

    const choice = firstResponse.data.choices[0];
    const functionCall = choice.message.function_call;

    if (functionCall) {
      const args = JSON.parse(functionCall.arguments);
      const data = await handleFunctionCall(
        functionCall.name,
        args,
        user,
        message
      );

      const secondMessages = [
        ...messages,
        choice.message,
        {
          role: "function",
          name: functionCall.name,
          content: JSON.stringify(data),
        },
      ];

      const secondResponse = await openai.createChatCompletion({
        model: "gpt-3.5-turbo-1106",
        messages: secondMessages,
      });

      return res.json({
        reply: secondResponse.data.choices[0].message.content,
        history: [
          ...history,
          { role: "user", content: message },
          choice.message,
          {
            role: "function",
            name: functionCall.name,
            content: JSON.stringify(data),
          },
        ],
      });
    }

    return res.json({
      reply: choice.message.content,
      history: [...history, { role: "user", content: message }, choice.message],
    });
  } catch (err) {
    console.error("Chatbot error:", err.response?.data || err.message);
    res.status(500).json({ error: "Error processing request" });
  }
});

module.exports = router;
