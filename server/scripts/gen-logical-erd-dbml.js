/**
 * Sinh Logical ERD dạng DBML từ Prisma DMMF — để paste thẳng vào https://dbdiagram.io.
 * - Tên bảng/thuộc tính theo "tên nghiệp vụ" (giống gen-logical-erd.js).
 * - KHÔNG hiện kiểu dữ liệu: cột thường để type rỗng, cột PK/FK dùng chính "PK"/"FK"
 *   làm type (DBML bắt buộc phải có 1 token type nên không thể bỏ hẳn cột này).
 * - Cuối file là các dòng `Ref:` (quan hệ) — dbdiagram.io tự vẽ cardinality từ đó.
 * Chạy: node scripts/gen-logical-erd-dbml.js  ->  prisma/dbml/family-care-logical.dbml
 */
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');

const models = Prisma.dmmf.datamodel.models;

function toBusiness(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bUrl\b/g, 'URL')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const alias = (m) => m.replace(/[^A-Za-z0-9]/g, '');
const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// ---- Gom quan hệ theo relationName (chỉ để dựng Ref: ở cuối file) ----
const rels = new Map();
for (const model of models) {
  for (const f of model.fields) {
    if (f.kind !== 'object' || !f.relationName) continue;
    if (!rels.has(f.relationName)) rels.set(f.relationName, []);
    rels.get(f.relationName).push({ model: model.name, field: f });
  }
}

const lines = [];
lines.push('//// ------------------------------------------------------');
lines.push('//// LOGICAL ERD — auto-generated từ Prisma schema. Chỉ hiện tên thuộc tính +');
lines.push('//// đánh dấu PK/FK, KHÔNG hiện kiểu dữ liệu vật lý.');
lines.push('//// Cách xem: mở https://dbdiagram.io -> Import -> DBML (hoặc paste nội dung file này).');
lines.push('//// Chạy lại: node scripts/gen-logical-erd-dbml.js');
lines.push('//// ------------------------------------------------------');
lines.push('');
lines.push('Project "Family Care - Logical ERD" {');
lines.push("  Note: 'Mo hinh du lieu muc nghiep vu - chi hien thuoc tinh + PK/FK, khong hien kieu du lieu vat ly.'");
lines.push('}');
lines.push('');

// ---- Tables ----
for (const model of models) {
  const fkFields = new Set();
  for (const f of model.fields) {
    if (f.kind === 'object' && Array.isArray(f.relationFromFields)) {
      f.relationFromFields.forEach((c) => fkFields.add(c));
    }
  }
  lines.push(`Table ${q(toBusiness(model.name))} as ${alias(model.name)} {`);
  const scalarFields = model.fields.filter((f) => f.kind !== 'object');
  for (const f of scalarFields) {
    let type;
    const attrs = [];
    if (f.isId) {
      type = 'PK';
      attrs.push('pk');
    } else if (fkFields.has(f.name)) {
      type = 'FK';
    } else {
      type = '""';
    }
    const attrStr = attrs.length ? ` [${attrs.join(', ')}]` : '';
    lines.push(`  ${q(toBusiness(f.name))} ${type}${attrStr}`);
  }
  lines.push('}');
  lines.push('');
}

// ---- Relationships ----
lines.push('// ===== Relationships =====');
let refCount = 0;
for (const [, sides] of rels) {
  if (sides.length < 2) continue;
  const [a, b] = sides;
  const fkSide =
    Array.isArray(a.field.relationFromFields) && a.field.relationFromFields.length
      ? a
      : Array.isArray(b.field.relationFromFields) && b.field.relationFromFields.length
        ? b
        : null;
  if (!fkSide) continue; // implicit many-to-many (không có trong schema hiện tại) -> bỏ qua
  const otherSide = fkSide === a ? b : a;
  const fromFields = fkSide.field.relationFromFields;
  const toFields = fkSide.field.relationToFields;
  fromFields.forEach((fcol, idx) => {
    const tcol = toFields[idx];
    lines.push(`Ref: ${alias(fkSide.model)}.${q(toBusiness(fcol))} > ${alias(otherSide.model)}.${q(toBusiness(tcol))}`);
    refCount += 1;
  });
}

const outDir = path.join(__dirname, '..', 'prisma', 'dbml');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'family-care-logical.dbml');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${out}`);
console.log(`Tables: ${models.length}, Refs: ${refCount}`);
