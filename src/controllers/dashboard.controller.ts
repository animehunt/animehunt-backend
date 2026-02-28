import { Request, Response } from "express";
import Anime from "../models/Anime.model";
import Episode from "../models/Episode.model";
import Category from "../models/Category.model";
import Banner from "../models/Banner.model";
import Download from "../models/Download.model";
import Ad from "../models/Ad.model";
import HomepageRow from "../models/HomepageRow.model";

export const getDashboard = async (_req: Request, res: Response) => {
  try {

    /* ===========================
       CORE COUNTS
    ============================ */
    const [
      animeCount,
      episodeCount,
      categoryCount,
      bannerCount,
      downloadCount
    ] = await Promise.all([
      Anime.countDocuments(),
      Episode.countDocuments(),
      Category.countDocuments(),
      Banner.countDocuments(),
      Download.countDocuments()
    ]);

    /* ===========================
       GROWTH DATA
    ============================ */
    const activeAds = await Ad.countDocuments({ status: "ON" });

    const trendingAnime = await Anime.countDocuments({ isTrending: true });
    const ongoingAnime = await Anime.countDocuments({ status: "ongoing" });
    const topRated = await Anime.countDocuments({
      rating: { $gte: 8 }
    });

    // Fake revenue + clicks (replace later with analytics table)
    const todayRevenue = 0;
    const adClicks = 0;

    /* ===========================
       SYSTEM STATUS
    ============================ */
    const cmsStatus = "OK";
    const serverLoad = "Low";
    const apiStatus = "Online";
    const aiStatus = "Active";
    const searchStatus = "Ready";
    const backupStatus = "Synced";

    res.json({
      core: {
        animeCount,
        episodeCount,
        categoryCount,
        bannerCount,
        downloadCount,
        serverCount: 0
      },
      growth: {
        activeAds,
        todayRevenue,
        adClicks,
        trendingAnime,
        ongoingAnime,
        topRated
      },
      system: {
        cmsStatus,
        serverLoad,
        apiStatus,
        aiStatus,
        searchStatus,
        backupStatus
      }
    });

  } catch {
    res.status(500).json({ message: "Dashboard load failed" });
  }
};
