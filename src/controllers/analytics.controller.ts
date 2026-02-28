import { Request, Response } from "express";
import AnalyticsEvent from "../models/AnalyticsEvent.model";

/* ===========================
   DATE FILTER HELPER
=========================== */
function getDateFilter(range: string) {
  const now = new Date();
  let startDate = new Date();

  switch (range) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      break;
    case "7":
      startDate.setDate(now.getDate() - 7);
      break;
    case "30":
      startDate.setDate(now.getDate() - 30);
      break;
    case "365":
      startDate.setDate(now.getDate() - 365);
      break;
    default:
      startDate.setDate(now.getDate() - 7);
  }

  return { createdAt: { $gte: startDate } };
}

/* ===========================
   GET ANALYTICS DASHBOARD
=========================== */
export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7";
    const filter = getDateFilter(range);

    const stats = {
      visitors: await AnalyticsEvent.countDocuments({
        ...filter,
        type: "VISITOR"
      }),
      pageViews: await AnalyticsEvent.countDocuments({
        ...filter,
        type: "PAGE_VIEW"
      }),
      animeViews: await AnalyticsEvent.countDocuments({
        ...filter,
        type: "ANIME_VIEW"
      }),
      episodeViews: await AnalyticsEvent.countDocuments({
        ...filter,
        type: "EPISODE_VIEW"
      }),
      downloads: await AnalyticsEvent.countDocuments({
        ...filter,
        type: "DOWNLOAD"
      }),
      searches: await AnalyticsEvent.countDocuments({
        ...filter,
        type: "SEARCH"
      })
    };

    const topAnime = await AnalyticsEvent.aggregate([
      { $match: { ...filter, type: "ANIME_VIEW" } },
      { $group: { _id: "$animeSlug", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    const topEpisodes = await AnalyticsEvent.aggregate([
      { $match: { ...filter, type: "EPISODE_VIEW" } },
      { $group: { _id: "$episodeId", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    const topSearches = await AnalyticsEvent.aggregate([
      { $match: { ...filter, type: "SEARCH" } },
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const topCategories = await AnalyticsEvent.aggregate([
      { $match: { ...filter, type: "ANIME_VIEW" } },
      { $group: { _id: "$category", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]);

    const topBanners = await AnalyticsEvent.aggregate([
      { $match: { ...filter, type: "BANNER_CLICK" } },
      { $group: { _id: "$banner", clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: 10 }
    ]);

    const topServers = await AnalyticsEvent.aggregate([
      { $match: { ...filter, type: "SERVER_VIEW" } },
      { $group: { _id: "$server", views: { $sum: 1 } } },
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
      topSearches: topSearches.map(s => ({
        query: s._id,
        count: s.count
      })),
      topCategories: topCategories.map(c => ({
        category: c._id,
        views: c.views
      })),
      topBanners: topBanners.map(b => ({
        banner: b._id,
        clicks: b.clicks
      })),
      topServers: topServers.map(s => ({
        server: s._id,
        views: s.views
      }))
    });
  } catch (error) {
    res.status(500).json({ message: "Analytics fetch failed" });
  }
};
