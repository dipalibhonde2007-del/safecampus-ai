import jwt from "jsonwebtoken";
import StaffUser from "../models/StaffUser.js";

export const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.sendStatus(401);

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "admin") return res.sendStatus(401);

    
    const staff = await StaffUser.findById(payload.id);
    if (!staff || !staff.active) return res.sendStatus(401);

    req.staff = staff;
    next();
  } catch {
    res.sendStatus(401);
  }
};

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.staff?.role) ? next() : res.sendStatus(403);