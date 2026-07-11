                            const jwt = require("jsonwebtoken");
                            const USER = require("../model/user");

                            async function authMiddleware(req, res, next) {
                              const token = req.headers.authorization?.split(" ")[1];
                              if (!token) {
                                return res.status(401).json({ status: "Fail", message: "No token" });
                              }

                              try {
                                const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
                                const userVerify = await USER.findById(decoded.id)
                                if (!userVerify) {
                                  return res.status(401).json({ status: "Fail", message: "Invalid token" });
                                }
                                req.user = userVerify;
                                next();
                              } catch (err) {
                                res.status(401).json({ status: "Fail", message: "Invalid token" });
                              }
                            }

                            module.exports = authMiddleware;
