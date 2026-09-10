/* Listings CRUD + nested photos/documents queries. */
import { ListingModel } from '../models/Listing.js';
import { ListingPhotoModel } from '../models/ListingPhoto.js';
import { ListingDocumentModel } from '../models/ListingDocument.js';
import { parsePage, buildMeta } from '../utils/pagination.js';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env.js';

const VALID_TYPES = ['villa', 'property', 'land', 'commercial', 'apartment'];
const VALID_STATUS = ['live', 'soon', 'closed', 'draft', 'review'];

/** Validasi input listing. Mengembalikan pesan error atau null. */
function validateListing(body, { partial = false } = {}) {
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) return 'Judul listing wajib diisi';
    if (body.title.length > 200) return 'Judul maksimal 200 karakter';
  }
  if (body.type !== undefined && !VALID_TYPES.includes(body.type)) return `Tipe harus salah satu: ${VALID_TYPES.join(', ')}`;
  if (body.status !== undefined && !VALID_STATUS.includes(body.status)) return `Status harus salah satu: ${VALID_STATUS.join(', ')}`;
  if (body.price !== undefined && body.price !== null && !(Number.isFinite(Number(body.price)) && Number(body.price) >= 0)) return 'Harga harus angka ≥ 0';
  return null;
}

const canSeeDraft = (req, listing) => !!req.user && (req.user.role === 'admin' || listing.createdBy === req.user.id);

/* Hapus berkas foto/dokumen dari disk (best-effort) saat listing dihapus. */
function unlinkFiles(paths) {
  for (const p of paths) {
    try {
      const full = path.resolve(env.UPLOAD_DIR, String(p).replace(/^\/files\//, ''));
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch {}
  }
}

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
    /* ?mine=1 → hanya listing yang dibuat oleh user yang login (dasbor agen). */
    let createdBy;
    if (req.query.mine) {
      if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
      createdBy = req.user.id;
    }
    const { total, rows } = ListingModel.search({
      type: req.query.type,
      region: req.query.region,
      verifLevel: req.query.verif_level,
      q: req.query.q,
      status: req.query.status,
      source: req.query.source,
      createdBy,
      /* Draft hanya terlihat oleh admin, atau pembuatnya lewat ?mine=1. */
      excludeDraft: !(req.user?.role === 'admin' || createdBy),
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
    if (listing.status === 'draft' && !canSeeDraft(req, listing)) return res.status(404).json({ error: 'Listing not found' });
    res.json({ data: decorate(listing) });
  },

  async create(req, res) {
    const invalid = validateListing(req.body || {});
    if (invalid) return res.status(400).json({ error: invalid });
    const input = { ...req.body, title: req.body.title.trim(), createdBy: req.user?.id };
    /* Agen / pemilik: listing selalu atas nama akun yang login dan langsung tayang. */
    if (req.user?.role !== 'admin') {
      input.agentName = req.user.name || input.agentName || 'Agen';
      input.agency = req.user.accountType === 'owner' ? 'Owner Direct' : 'Assetra Agent';
      input.source = 'portal';
      input.status = 'live';
    }
    const listing = ListingModel.create(input);
    res.status(201).json({ data: decorate(listing) });
  },

  async update(req, res) {
    const id = decodeURIComponent(req.params.id);
    const exists = ListingModel.findById(id);
    if (!exists) return res.status(404).json({ error: 'Listing not found' });
    const invalid = validateListing(req.body || {}, { partial: true });
    if (invalid) return res.status(400).json({ error: invalid });
    const listing = ListingModel.update(id, req.body || {});
    res.json({ data: decorate(listing) });
  },

  async remove(req, res) {
    const id = decodeURIComponent(req.params.id);
    const files = [
      ...ListingPhotoModel.listByListing(id).map(p => p.path),
      ...ListingDocumentModel.listByListing(id).map(d => d.path),
    ];
    const ok = ListingModel.remove(id);
    if (!ok) return res.status(404).json({ error: 'Listing not found' });
    unlinkFiles(files);
    res.status(204).end();
  },
};
