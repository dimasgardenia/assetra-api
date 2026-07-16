/** Parse page/per_page from query, returns { page, perPage, offset }. */
export function parsePage(query, defaults = { page: 1, perPage: 9 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const perPage = Math.min(100, Math.max(1, parseInt(query.per_page, 10) || defaults.perPage));
  return { page, perPage, offset: (page - 1) * perPage };
}

export function buildMeta({ total, page, perPage }) {
  return {
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}
