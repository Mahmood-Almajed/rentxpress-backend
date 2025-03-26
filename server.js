const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');

dotenv.config();

require('./config/database');
const express = require('express');

// Auth
const verifyToken = require('./middleware/verify-token');

// Controllers
const testJWTRouter = require('./controllers/test-jwt');
const usersRouter = require('./controllers/users');
const profilesRouter = require('./controllers/profiles');
const carsRouter = require('./controllers/cars');
const rentalsRouter = require('./controllers/rentals')
const approvalsRouter= require('./controllers/approval')

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes/
app.use('/test-jwt', testJWTRouter); 
app.use('/users', usersRouter);
app.use('/cars', carsRouter);
app.use('/rentals', rentalsRouter)
app.use('/approval', approvalsRouter)


// Protected Routes
app.use(verifyToken)
app.use('/profiles', profilesRouter);

app.listen(PORT, () => {
  console.log('The express app is ready!');
});