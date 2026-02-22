import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const verifyAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).json({ message: "No token" });
  }

  const token = auth.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    );

    (req as any).user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid token" });
  }
};
