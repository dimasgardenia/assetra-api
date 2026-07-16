/* Ad banner management — admin uploads a banner per placement; the public
   site renders it and reports clicks. */
import { AdBannerModel } from '../models/AdBanner.js';

const PLACEMENTS = ['home-leaderboard', 'home-box', 'search-box', 'search-leaderboard', 'detail-box'];

export const bannerController = {
  /** Public: map placement → active banner. */
  async active(req, res) {
    res.json({ data: AdBannerModel.activeByPlacement() });
  },

  /** Admin: full list incl. click counts. */
  async list(req, res) {
    res.json({ data: AdBannerModel.listAll() });
  },

  /** Admin: create banner (multipart: image file + placement + link_url + title). */
  async create(req, res) {
    const { placement, linkUrl, title } = req.body || {};
    if (!PLACEMENTS.includes(placement)) {
      return res.status(400).json({ error: `placement must be one of: ${PLACEMENTS.join(', ')}` });
    }
    if (!req.file) return res.status(400).json({ error: 'image file is required (field "image")' });
    if (!linkUrl || !/^https?:\/\//i.test(linkUrl)) {
      return res.status(400).json({ error: 'linkUrl must start with http:// or https://' });
    }
    const banner = AdBannerModel.create({
      placement,
      imagePath: `/files/banners/${req.file.filename}`,
      linkUrl,
      title,
    });
    res.status(201).json({ data: banner });
  },

  /** Public: record a click. */
  async click(req, res) {
    const ok = AdBannerModel.incrementClick(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Banner not found' });
    res.status(204).end();
  },

  /** Admin: delete (placement falls back to the demo ad). */
  async remove(req, res) {
    const ok = AdBannerModel.remove(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Banner not found' });
    res.status(204).end();
  },
};
