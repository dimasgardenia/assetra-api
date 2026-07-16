import { db } from '../config/db.js';

const COLS = `
  id, title, type, type_label AS typeLabel, address, region,
  current_bid AS currentBid, starting_bid AS startingBid, buy_now AS buyNow, deposit,
  bidders, bids, end_date AS endDate, status, trust_score AS trustScore,
  verifications, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt,
  price, mode, beds, baths, area, agent_name AS agentName, agency, promo, source,
  description, certificate, year_built AS yearBuilt, building_area AS buildingArea, floors, facilities
`;

const parseRow = (row) => {
  if (!row) return null;
  let facilities = [];
  try { facilities = JSON.parse(row.facilities || '[]'); } catch { facilities = []; }
  return { ...row, verifications: JSON.parse(row.verifications || '[]'), facilities };
};

export const ListingModel = {
  findById(id) {
    return parseRow(db.prepare(`SELECT ${COLS} FROM listings WHERE id = ?`).get(id));
  },

  /** Paginated search. Filters: type, region, verifLevel ('kemenkeu'|'bpn'), q (text), source ('portal'). */
  search({ type, region, verifLevel, q, limit, offset, status, source }) {
    const where = [];
    const params = {};
    if (type && type !== 'all')      { where.push('type = @type'); params.type = type; }
    if (region && region !== 'any')  { where.push('region = @region'); params.region = region; }
    if (status)                      { where.push('status = @status'); params.status = status; }
    if (source)                      { where.push('source = @source'); params.source = source; }
    if (verifLevel === 'kemenkeu')   { where.push(`verifications LIKE '%KEMENKEU%'`); }
    if (verifLevel === 'bpn')        { where.push(`verifications LIKE '%BPN%'`); }
    if (q) {
      where.push('(LOWER(title) LIKE @q OR LOWER(address) LIKE @q OR LOWER(id) LIKE @q)');
      params.q = `%${q.toLowerCase()}%`;
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) AS c FROM listings ${whereClause}`).get(params).c;
    /* Marketplace listings: newest first. Auction listings: soonest ending first. */
    const orderBy = source === 'portal' ? 'created_at DESC' : 'end_date ASC';
    const rows = db.prepare(`
      SELECT ${COLS} FROM listings
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });
    return { total, rows: rows.map(parseRow) };
  },

  create(input) {
    const id = input.id || `AST·2026·${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const now = Date.now();
    db.prepare(`
      INSERT INTO listings
        (id, title, type, type_label, address, region, current_bid, starting_bid, buy_now, deposit,
         bidders, bids, end_date, status, trust_score, verifications, created_by, created_at, updated_at,
         price, mode, beds, baths, area, agent_name, agency, promo, source,
         description, certificate, year_built, building_area, floors, facilities)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.title || 'Untitled', input.type || 'property', input.typeLabel || null,
      input.address || null, input.region || null,
      input.startingBid || 0, input.startingBid || 0,
      input.buyNow || 0, input.deposit || 0,
      input.endDate || (now + 1000*60*60*24*7),
      input.status || 'live',
      input.trustScore || 90,
      JSON.stringify(input.verifications || ['SHM', 'BPN']),
      input.createdBy || null, now, now,
      input.price ?? null, input.mode || null,
      input.beds ?? null, input.baths ?? null, input.area ?? null,
      input.agentName || null, input.agency || null,
      input.promo || null, input.source || null,
      input.description || null, input.certificate || null,
      input.yearBuilt ?? null, input.buildingArea ?? null, input.floors ?? null,
      JSON.stringify(input.facilities || []),
    );
    return ListingModel.findById(id);
  },

  bumpBidStats(id, newCurrentBid) {
    db.prepare(`
      UPDATE listings
      SET current_bid = ?,
          bids = bids + 1,
          updated_at = ?
      WHERE id = ?
    `).run(newCurrentBid, Date.now(), id);
  },

  recomputeBidders(id) {
    const bidders = db.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM bids WHERE listing_id = ? AND user_id IS NOT NULL`).get(id).c;
    db.prepare(`UPDATE listings SET bidders = ? WHERE id = ?`).run(bidders, id);
  },

  update(id, patch) {
    const fields = [];
    const params = [];
    const map = {
      title: 'title', address: 'address', region: 'region', status: 'status', trustScore: 'trust_score',
      price: 'price', mode: 'mode', beds: 'beds', baths: 'baths', area: 'area',
      agentName: 'agent_name', agency: 'agency', promo: 'promo',
      description: 'description', certificate: 'certificate', yearBuilt: 'year_built',
      buildingArea: 'building_area', floors: 'floors',
    };
    if (Array.isArray(patch.facilities)) {
      fields.push('facilities = ?');
      params.push(JSON.stringify(patch.facilities));
    }
    for (const [k, v] of Object.entries(patch)) {
      if (map[k]) { fields.push(`${map[k]} = ?`); params.push(v); }
    }
    if (!fields.length) return ListingModel.findById(id);
    params.push(Date.now(), id);
    db.prepare(`UPDATE listings SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...params);
    return ListingModel.findById(id);
  },

  remove(id) {
    return db.prepare('DELETE FROM listings WHERE id = ?').run(id).changes > 0;
  },
};
