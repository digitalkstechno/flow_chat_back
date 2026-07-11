const {
  createUserService,
  loginUserService,
  fetchAllUsersService,
  fetchUserByIdService,
  userUpdateService,
  userDeleteService,
} = require("../service/user");

exports.createUser = async (req, res) => {
  try {
    const userDetails = await createUserService(req.body);
    return res.status(201).json({ status: "Success", message: "User created successfully", data: userDetails });
  } catch (error) {
    return res.status(400).json({ status: "Fail", message: error.message });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { user, token } = await loginUserService(req.body);
    return res.status(200).json({ status: "Success", message: "User logged in successfully", data: user, token });
  } catch (error) {
    return res.status(400).json({ status: "Fail", message: error.message });
  }
};

exports.fetchAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const { totalUser, usersData } = await fetchAllUsersService({ page, limit, search });
    return res.status(200).json({
      status: "Success",
      message: "Users fetched successfully",
      pagination: { totalRecords: totalUser, currentPage: page, totalPages: Math.ceil(totalUser / limit), limit },
      data: usersData,
    });
  } catch (error) {
    return res.status(500).json({ status: "Fail", message: error.message });
  }
};

exports.fetchUserById = async (req, res) => {
  try {
    const userData = await fetchUserByIdService(req.params.id);
    return res.status(200).json({ status: "Success", message: "User fetched successfully", data: userData });
  } catch (error) {
    return res.status(404).json({ status: "Fail", message: error.message });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ status: "Fail", message: "Unauthorized" });
    const mongoose = require("mongoose");
    const oldestUser = await mongoose.model("User").findOne().sort({ createdAt: 1 });
    const isMaster = req.user.isMaster || (oldestUser && String(oldestUser._id) === String(req.user._id));
    const userObj = req.user.toObject();
    userObj.isMaster = !!isMaster;
    return res.status(200).json({ status: "Success", data: userObj });
  } catch (error) {
    return res.status(500).json({ status: "Fail", message: error.message });
  }
};

exports.userUpdate = async (req, res) => {
  try {
    const updatedUser = await userUpdateService(req.params.id, req.body);
    return res.status(200).json({ status: "Success", message: "User updated successfully", data: updatedUser });
  } catch (error) {
    return res.status(404).json({ status: "Fail", message: error.message });
  }
};

exports.userDelete = async (req, res) => {
  try {
    await userDeleteService(req.params.id);
    return res.status(200).json({ status: "Success", message: "User deleted successfully" });
  } catch (error) {
    return res.status(404).json({ status: "Fail", message: error.message });
  }
};
