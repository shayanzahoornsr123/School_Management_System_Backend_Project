const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * ===================================
 * 🔐 Verify JWT Token Middleware
 * ===================================
 */
exports.verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    // ✅ Check if header exists and starts with Bearer
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    const token = header.split(" ")[1];

    // ✅ Verify token validity
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res
          .status(401)
          .json({ message: "Session expired. Please log in again." });
      }
      return res.status(401).json({ message: "Invalid authentication token" });
    }

    // ✅ Fetch user (without password)
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // ✅ Prevent access for unapproved users
    if (!user.isApproved) {
      return res
        .status(403)
        .json({ message: "Your account is pending admin approval." });
    }

    // ✅ Attach user and token data to request
    req.user = user;
    req.auth = decoded;

    next();
  } catch (err) {
    console.error("❌ verifyToken error:", err);
    return res
      .status(500)
      .json({ message: "Server error during token verification" });
  }
};

/**
 * ===================================
 * 🧭 Role-Based Access Middleware
 * ===================================
 */
exports.authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied. You do not have permission for this action.",
        allowedRoles: roles,
        userRole: req.user.role,
      });
    }

    next();
  };
};
