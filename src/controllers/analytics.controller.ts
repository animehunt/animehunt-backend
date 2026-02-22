import { Request, Response } from "express";
import Analytics from "../models/analytics.model";

// ============================
// GET ADMIN ANALYTICS
// ============================
export const getAdminAnalytics = async (req: Request, res: Response) => {
  try {
    const range = req.query.range || "today";

    let days = 1;
    if (range === "7") days = 7;
    if (range === "30") days = 30;
    if (range === "365") days = 365;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // ===== BASIC STATS =====
    const stats = {
      visitors: await Analytics.countDocuments({ type: "visit", createdAt: { $gte: startDate } }),
      pageViews: await Analytics.countDocuments({ type: "pageView", createdAt: { $gte: startDate } }),
      animeViews: await Analytics.countDocuments({ type: "animeView", createdAt: { $gte: startDate } }),
      episodeViews: await Analytics.countDocuments({ type: "episodeView", createdAt: { $gte: startDate } }),
      downloads: await Analytics.countDocuments({ type: "download", createdAt: { $gte: startDate } }),
      searches: await Analytics.countDocuments({ type: "search", createdAt: { $gte: startDate } }),
    };

    // ===== TOP ANIME =====
    const topAnime = await Analytics.aggregate([
      { $match: { type: "animeView", createdAt: { $gte: startDate } } },
      { $group: { _id: "$animeSlug", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    // ===== TOP EPISODES =====
    const topEpisodes = await Analytics.aggregate([
      { $match: { type: "episodeView", createdAt: { $gte: startDate } } },
      { $group: { _id: "$episodeId", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      stats,
      topAnime: topAnime.map(a => ({
        animeSlug: a._id,
        views: a.views
      })),
      topEpisodes: topEpisodes.map(e => ({
        episodeId: e._id,
        views: e.views
      })),
      topSearches: [],
      topCategories: [],
      topBanners: [],
      topServers: []
    });

  } catch (err) {
    res.status(500).json({ message: "Analytics failed" });
  }
};
