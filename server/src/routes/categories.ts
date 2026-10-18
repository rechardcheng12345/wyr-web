import { Router } from "express";
import { prisma } from "../db.js";

export const categoriesRouter = Router();

// GET /api/categories — flat list with active product counts, for filters and the home page.
categoriesRouter.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { products: { where: { isActive: true } } } } },
  });
  res.json(
    categories.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      slug: c.slug,
      productCount: c._count.products,
    })),
  );
});
