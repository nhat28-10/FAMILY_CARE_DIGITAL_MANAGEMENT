/**
 * Sinh Logical ERD dạng file .drawio (draw.io / diagrams.net) NATIVE — mỗi thực thể là
 * 1 shape sửa/kéo được, thuộc tính là các dòng con, quan hệ là edge crow's foot.
 * - Bỏ kiểu dữ liệu, dùng tên nghiệp vụ, đánh dấu (PK)/(FK).
 * - MỘT sơ đồ duy nhất (không tách).
 * Chạy: node scripts/gen-logical-erd-drawio.js  ->  prisma/logical-erd.drawio
 * Mở bằng draw.io, rồi Arrange -> Layout -> (Organic/Tree) để dàn đẹp.
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
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const id = (m) => 'e_' + m.replace(/[^A-Za-z0-9]/g, '');

const HEADER = 26, ROW = 22, W = 210, GAP_X = 90, GAP_Y = 50, PER_COL = 7;

const cells = [];
cells.push('<mxCell id="0"/>');
cells.push('<mxCell id="1" parent="0"/>');

// ---- Entities ----
let col = 0, row = 0, colBottoms = [];
models.forEach((model, i) => {
  const fk = new Set();
  model.fields.forEach((f) => {
    if (f.kind === 'object' && Array.isArray(f.relationFromFields)) f.relationFromFields.forEach((c) => fk.add(c));
  });
  const attrs = model.fields.filter((f) => f.kind !== 'object');
  const h = HEADER + attrs.length * ROW;

  if (row >= PER_COL) { row = 0; col++; }
  const x = col * (W + GAP_X);
  const y = (colBottoms[col] || 0);
  colBottoms[col] = y + h + GAP_Y;
  row++;

  const eid = id(model.name);
  cells.push(
    `<mxCell id="${eid}" value="${esc(toBusiness(model.name))}" ` +
    `style="swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=${HEADER};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;fillColor=#FDF6E3;strokeColor=#586E75;" ` +
    `vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${W}" height="${h}" as="geometry"/></mxCell>`
  );
  attrs.forEach((f, j) => {
    let label = toBusiness(f.name);
    if (f.isId) label += ' (PK)';
    else if (fk.has(f.name)) label += ' (FK)';
    const fs2 = f.isId ? 'fontStyle=4;' : ''; // PK gạch chân
    cells.push(
      `<mxCell id="${eid}_${j}" value="${esc(label)}" ` +
      `style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=6;overflow=hidden;rotatable=0;points=[[0,0.5,0],[1,0.5,0]];portConstraint=eastwest;${fs2}" ` +
      `vertex="1" parent="${eid}"><mxGeometry y="${HEADER + j * ROW}" width="${W}" height="${ROW}" as="geometry"/></mxCell>`
    );
  });
});

// ---- Relationships ----
const rels = new Map();
for (const model of models)
  for (const f of model.fields) {
    if (f.kind !== 'object' || !f.relationName) continue;
    if (!rels.has(f.relationName)) rels.set(f.relationName, []);
    rels.get(f.relationName).push({ model: model.name, isList: f.isList });
  }

let ei = 0;
for (const sides of rels.values()) {
  if (sides.length < 2) continue;
  const [a, b] = sides;
  let src, tgt, sArr, eArr;
  if (a.isList && b.isList) { src = a.model; tgt = b.model; sArr = 'ERmany'; eArr = 'ERmany'; }
  else if (a.isList !== b.isList) {
    const one = a.isList ? a : b, many = a.isList ? b : a;
    src = one.model; tgt = many.model; sArr = 'ERone'; eArr = 'ERmany';
  } else { src = a.model; tgt = b.model; sArr = 'ERone'; eArr = 'ERone'; }
  cells.push(
    `<mxCell id="rel_${ei++}" style="edgeStyle=entityRelationEdgeStyle;fontSize=10;html=1;endArrow=${eArr};startArrow=${sArr};startFill=0;endFill=0;rounded=0;strokeColor=#586E75;" ` +
    `edge="1" parent="1" source="${id(src)}" target="${id(tgt)}"><mxGeometry relative="1" as="geometry"/></mxCell>`
  );
}

const xml =
  `<mxfile host="app.diagrams.net">\n<diagram name="Logical ERD">\n<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1200" math="0" shadow="0">\n<root>\n` +
  cells.join('\n') +
  `\n</root>\n</mxGraphModel>\n</diagram>\n</mxfile>\n`;

const out = path.join(__dirname, '..', 'prisma', 'logical-erd.drawio');
fs.writeFileSync(out, xml, 'utf8');
console.log(`Wrote ${out}`);
console.log(`Entities: ${models.length}, Relationships: ${[...rels.values()].filter((s) => s.length >= 2).length}`);
