import { WatchlistModel } from '../models/Watchlist.js';
import { ListingModel } from '../models/Listing.js';

export const watchlistController = {
  async list(req, res) {
    res.json({ data: WatchlistModel.listForUser(req.user.id) });
  },
  async add(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    if (!ListingModel.findById(listingId)) return res.status(404).json({ error: 'Listing not found' });
    WatchlistModel.add(req.user.id, listingId);
    res.status(201).json({ ok: true });
  },
  async remove(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    WatchlistModel.remove(req.user.id, listingId);
    res.status(204).end();
  },
};
