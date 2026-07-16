/* Bids: list per listing, list per user, place a new bid. */
import { BidModel } from '../models/Bid.js';
import { ListingModel } from '../models/Listing.js';

export const bidController = {
  async listForListing(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    const bids = BidModel.listByListing(listingId);
    res.json({ data: bids });
  },

  async listMine(req, res) {
    const bids = BidModel.listByUser(req.user.id);
    res.json({ data: bids });
  },

  async place(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    const listing = ListingModel.findById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const amount = Number(req.body?.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (amount <= listing.currentBid) return res.status(400).json({ error: 'Bid must be higher than current bid' });
    if (listing.status === 'closed') return res.status(409).json({ error: 'Auction closed' });

    const bid = BidModel.create({
      listingId,
      userId: req.user.id,
      amount,
      who: req.user.name || req.user.email,
      verified: req.user.kycVerified ? 'KEMENKEU' : 'BPN',
    });
    ListingModel.bumpBidStats(listingId, amount);
    ListingModel.recomputeBidders(listingId);
    res.status(201).json({ data: bid, listing: ListingModel.findById(listingId) });
  },
};
