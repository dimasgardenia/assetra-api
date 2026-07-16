/* Multipart file uploads for listing photos and documents. */
import path from 'path';
import fs from 'fs';
import { ListingPhotoModel } from '../models/ListingPhoto.js';
import { ListingDocumentModel } from '../models/ListingDocument.js';
import { ListingModel } from '../models/Listing.js';
import { env } from '../config/env.js';

const FILES_ROUTE = '/files';   // express.static mount

const toUrlPath = (folder, filename) => `${FILES_ROUTE}/${folder}/${filename}`;

export const uploadController = {
  /* POST /api/listings/:id/photos  (multipart: photos[]) */
  async addPhotos(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    if (!ListingModel.findById(listingId)) return res.status(404).json({ error: 'Listing not found' });
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const created = files.map(f => ListingPhotoModel.create({
      listingId,
      path: toUrlPath('photos', path.basename(f.path)),
      originalName: f.originalname,
      sizeBytes: f.size,
      mimeType: f.mimetype,
    }));

    res.status(201).json({ data: created, listing: ListingModel.findById(listingId) });
  },

  /* DELETE /api/listings/:id/photos/:photoId */
  async removePhoto(req, res) {
    const photoId = Number(req.params.photoId);
    const removed = ListingPhotoModel.remove(photoId);
    if (!removed) return res.status(404).json({ error: 'Photo not found' });
    // Try to unlink from disk (best-effort)
    try {
      const relativePath = removed.path.replace(FILES_ROUTE + '/', '');
      const fullPath = path.resolve(env.UPLOAD_DIR, relativePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {}
    res.status(204).end();
  },

  /* POST /api/listings/:id/photos/reorder  body: { ids: [photoId, ...] } */
  async reorderPhotos(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
    if (!ids) return res.status(400).json({ error: 'ids array required' });
    const result = ListingPhotoModel.reorder(listingId, ids);
    res.json({ data: result });
  },

  /* POST /api/listings/:id/documents/:slot  (multipart: file) */
  async uploadDocument(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    const slot = req.params.slot.toLowerCase();
    if (!ListingModel.findById(listingId)) return res.status(404).json({ error: 'Listing not found' });
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'File required' });

    const doc = ListingDocumentModel.upsert({
      listingId,
      slot,
      path: toUrlPath('docs', path.basename(f.path)),
      originalName: f.originalname,
      sizeBytes: f.size,
      mimeType: f.mimetype,
    });
    res.status(201).json({ data: doc });
  },

  /* DELETE /api/listings/:id/documents/:slot */
  async removeDocument(req, res) {
    const listingId = decodeURIComponent(req.params.id);
    const slot = req.params.slot.toLowerCase();
    const removed = ListingDocumentModel.remove(listingId, slot);
    if (!removed) return res.status(404).json({ error: 'Document not found' });
    try {
      const relativePath = removed.path.replace(FILES_ROUTE + '/', '');
      const fullPath = path.resolve(env.UPLOAD_DIR, relativePath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {}
    res.status(204).end();
  },

  /* GET /api/admin/documents — admin media library: all documents flattened */
  async listAllDocuments(req, res) {
    res.json({ data: ListingDocumentModel.listAll() });
  },
};
