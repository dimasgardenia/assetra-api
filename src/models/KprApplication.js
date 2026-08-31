import { db } from '../config/db.js';

const COLS = `
  id, name, phone, email, income, bank,
  property_price AS propertyPrice, loan_amount AS loanAmount, down_payment AS downPayment,
  tenor_years AS tenorYears, rate, status, created_at AS createdAt
`;

export const KprApplicationModel = {
  create(input) {
    const info = db.prepare(`
      INSERT INTO kpr_applications
        (name, phone, email, income, bank, property_price, loan_amount, down_payment, tenor_years, rate, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)
    `).run(
      input.name, input.phone, input.email || null, input.income ?? null, input.bank || null,
      input.propertyPrice ?? null, input.loanAmount ?? null, input.downPayment ?? null,
      input.tenorYears ?? null, input.rate ?? null, Date.now(),
    );
    return db.prepare(`SELECT ${COLS} FROM kpr_applications WHERE id = ?`).get(info.lastInsertRowid);
  },

  listAll() {
    return db.prepare(`SELECT ${COLS} FROM kpr_applications ORDER BY created_at DESC`).all();
  },

  updateStatus(id, status) {
    db.prepare('UPDATE kpr_applications SET status = ? WHERE id = ?').run(status, id);
    return db.prepare(`SELECT ${COLS} FROM kpr_applications WHERE id = ?`).get(id);
  },
};
