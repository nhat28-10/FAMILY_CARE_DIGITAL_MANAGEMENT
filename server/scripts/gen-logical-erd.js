/**
 * Sinh Logical ERD (PlantUML) từ Prisma DMMF.
 * - Bỏ kiểu dữ liệu vật lý, chỉ hiện tên thuộc tính (đặt lại theo "tên nghiệp vụ").
 * - Đánh dấu PK / FK, vẽ quan hệ + cardinality (crow's foot).
 * - MỘT sơ đồ duy nhất (không tách module).
 * Chạy: node scripts/gen-logical-erd.js  ->  prisma/logical-erd.puml
 */
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');

const models = Prisma.dmmf.datamodel.models;

// camelCase / snake_case / ACRONYM -> "Business Name"
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

const lines = [];
lines.push('@startuml Family-Care-Logical-ERD');
lines.push("' Logical Data Model - Family Care Digital Management");
lines.push("' Auto-generated from Prisma schema (no physical data types).");
lines.push('!pragma layout smetana');
lines.push('hide circle');
lines.push('hide methods');
lines.push('skinparam linetype ortho');
lines.push('skinparam entity {');
lines.push('  BackgroundColor #FDF6E3');
lines.push('  BorderColor #586E75');
lines.push('}');
lines.push('skinparam shadowing false');
lines.push('left to right direction');
lines.push('');

// ---- Entities ----
for (const model of models) {
  const fkFields = new Set();
  for (const f of model.fields) {
    if (f.kind === 'object' && Array.isArray(f.relationFromFields)) {
      f.relationFromFields.forEach((c) => fkFields.add(c));
    }
  }
  lines.push(`entity "${toBusiness(model.name)}" as ${alias(model.name)} {`);
  const pks = model.fields.filter((f) => f.kind !== 'object' && f.isId);
  const others = model.fields.filter((f) => f.kind !== 'object' && !f.isId);
  for (const f of pks) lines.push(`  * ${toBusiness(f.name)} <<PK>>`);
  if (pks.length) lines.push('  --');
  for (const f of others) {
    const req = f.isRequired ? '* ' : '  ';
    const tag = fkFields.has(f.name) ? ' <<FK>>' : '';
    lines.push(`  ${req}${toBusiness(f.name)}${tag}`);
  }
  lines.push('}');
  lines.push('');
}

// ---- Relationships (dedupe by relationName) ----
const rels = new Map();
for (const model of models) {
  for (const f of model.fields) {
    if (f.kind !== 'object' || !f.relationName) continue;
    const key = f.relationName;
    if (!rels.has(key)) rels.set(key, []);
    rels.get(key).push({
      model: model.name,
      isList: f.isList,
      hasFK: Array.isArray(f.relationFromFields) && f.relationFromFields.length > 0,
    });
  }
}

lines.push("' ===== Relationships =====");
for (const [name, sides] of rels) {
  if (sides.length < 2) continue; // bỏ quan hệ khuyết 1 phía
  const [a, b] = sides;
  let left, right, conn;
  if (a.isList && b.isList) {
    // many-to-many
    left = a.model; right = b.model; conn = '}o--o{';
  } else if (a.isList !== b.isList) {
    // one-to-many: phía "one" = phía isList (chứa danh sách many)
    const one = a.isList ? a : b;
    const many = a.isList ? b : a;
    left = one.model; right = many.model; conn = '||--o{';
  } else {
    // one-to-one
    left = a.model; right = b.model; conn = '||--||';
  }
  lines.push(`${alias(left)} ${conn} ${alias(right)}`);
}

lines.push('@enduml');

const out = path.join(__dirname, '..', 'prisma', 'logical-erd.puml');
fs.writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${out}`);
console.log(`Entities: ${models.length}, Relationships: ${[...rels.values()].filter((s) => s.length >= 2).length}`);
