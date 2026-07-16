/* Listings CRUD + nested photos/documents queries. */
import { ListingModel } from '../models/Listing.js';
import { ListingPhotoModel } from '../models/ListingPhoto.js';
import { ListingDocumentModel } from '../models/ListingDocument.js';
import { parsePage, buildMeta } from '../utils/pagination.js';

function decorate(listing) {
  if (!listing) return null;
  const photos = ListingPhotoModel.listByListing(listing.id);
  const documents = ListingDocumentModel.listByListing(listing.id);
  return {
    ...listing,
    photos: photos.length,                       // count (matches existing schema)
    uploadedPhotos: photos.map(p => p.path),     // array of URL paths
    photoFiles: photos,                          // detailed records
    documents: documents.reduce((acc, d) => ({ ...acc, [d.slot]: d }), {}),
  };
}

export const listingController = {
  async list(req, res) {
    const { page, perPage, offset } = parsePage(req.query, { page: 1, perPage: 9 });
    const { total, rows } = ListingModel.search({
      type: req.query.type,
      region: req.query.region,
      verifLevel: req.query.verif_level,
      q: req.query.q,
      status: req.query.status,
      source: req.query.source,
      limit: perPage,
      offset,
    });
    res.json({
      data: rows.map(decorate),
      meta: buildMeta({ total, page, perPage }),
    });
  },

  async get(req, res) {
    const id = decodeURIComponent(req.params.id);
    const listing = ListingModel.findById(id);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json({ data: decorate(listing) });
  },

  async create(req, res) {
    const input = { ...req.body, createdBy: req.user?.id };
    const listing = ListingModel.create(input);
    res.status(201).json({ data: decorate(listing) });
  },

  async update(req, res) {
    const id = decodeURIComponent(req.params.id);
    const exists = ListingModel.findById(id);
    if (!exists) return res.status(404).json({ error: 'Listing not found' });
    const listing = ListingModel.update(id, req.body || {});
    res.json({ data: decorate(listing) });
  },

  async remove(req, res) {
    const id = decodeURIComponent(req.params.id);
    const ok = ListingModel.remove(id);
    if (!ok) return res.status(404).json({ error: 'Listing not found' });
    res.status(204).end();
  },
};
