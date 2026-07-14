const dotenv = require("dotenv");
const connectDB = require("./config/db");
dotenv.config();
connectDB();
const dns = require("node:dns")
dns.setServers(['1.1.1.1','8.8.8.8'])
var createError = require("http-errors");
var express = require("express");
var path = require("path");
const cors = require('cors');
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/indexv1.js");

var app = express();
app.use(cors());

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "public", "uploads");
app.use("/uploads", express.static(uploadDir));

app.use("/v1/api", indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  const isApi = req.originalUrl.startsWith('/v1/api');
  const status = err.status || 500;

  if (isApi) {
    return res.status(status).json({
      success: false,
      message: err.message || 'Internal Server Error',
      error: req.app.get("env") === "development" ? err : {}
    });
  }

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(status);
  res.render("error");
});

module.exports = app;
