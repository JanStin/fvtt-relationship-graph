/**
 * S1 final: сравниваем layout-движки для compound nodes + varying scale
 * Run: node spikes/spike-layout-check.mjs
 */

import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import coseBilkent from 'cytoscape-cose-bilkent';
import cola from 'cytoscape-cola';

cytoscape.use(fcose);
cytoscape.use(coseBilkent);
cytoscape.use(cola);

const BASE_SIZE = 60;

const FACTIONS = [
  { id: 'f-zentarim', label: 'Зентарим' },
  { id: 'f-church',   label: 'Церковь Тира' },
  { id: 'f-cult',     label: 'Культ' },
];

const NODES_DATA = [
  { id: 'n01', label: 'Артадель',  faction: 'f-zentarim', scale: 1.0 },
  { id: 'n02', label: 'Дирк',      faction: 'f-zentarim', scale: 1.5 },
  { id: 'n03', label: 'Дрейк',     faction: 'f-zentarim', scale: 2.0 },
  { id: 'n04', label: 'Корвин',    faction: 'f-zentarim', scale: 3.0 },
  { id: 'n05', label: 'Миффи',     faction: 'f-zentarim', scale: 0.75 },
  { id: 'n06', label: 'Лориан',    faction: 'f-zentarim', scale: 1.25 },
  { id: 'n07', label: 'Кендрик',   faction: 'f-zentarim', scale: 0.5 },
  { id: 'n08', label: 'Кора',      faction: 'f-church',   scale: 1.0 },
  { id: 'n09', label: 'Перегрин',  faction: 'f-church',   scale: 2.5 },
  { id: 'n10', label: 'Дерек',     faction: 'f-church',   scale: 1.75 },
  { id: 'n11', label: 'Джек',      faction: 'f-church',   scale: 0.5 },
  { id: 'n12', label: '3й ранг',   faction: 'f-church',   scale: 1.0 },
  { id: 'n13', label: 'Туман',     faction: 'f-cult',     scale: 3.0 },
  { id: 'n14', label: 'Пташка',    faction: 'f-cult',     scale: 1.0 },
  { id: 'n15', label: 'Элигос',    faction: 'f-cult',     scale: 2.0 },
  { id: 'n16', label: 'Лотос',     faction: 'f-cult',     scale: 0.75 },
  { id: 'n17', label: 'Аспид',     faction: null,         scale: 1.5 },
  { id: 'n18', label: 'Цезария',   faction: null,         scale: 1.0 },
  { id: 'n19', label: 'Рид',       faction: null,         scale: 2.0 },
  { id: 'n20', label: 'Стас',      faction: null,         scale: 0.5 },
];

function buildElements(useCompound) {
  const elements = [];
  if (useCompound) {
    FACTIONS.forEach(f => {
      elements.push({ data: { id: f.id } });
    });
  }
  NODES_DATA.forEach(n => {
    const size = BASE_SIZE * n.scale;
    elements.push({
      data: {
        id: n.id,
        label: n.label,
        parent: (useCompound && n.faction) ? n.faction : undefined,
        scale: n.scale,
        size,
      },
      // style bypass — only way to pass node size to layout in headless mode
      style: { width: size, height: size },
    });
  });
  return elements;
}

function runLayout(cy, opts) {
  return new Promise((resolve) => {
    const layout = cy.layout(opts);
    layout.on('layoutstop', resolve);
    layout.on('error', e => resolve(e instanceof Error ? e : new Error(String(e))));
    try { layout.run(); } catch (e) { resolve(e instanceof Error ? e : new Error(String(e))); }
  });
}

function checkOverlaps(cy) {
  const factionIds = new Set(FACTIONS.map(f => f.id));
  const nodes = cy.nodes().filter(n => !factionIds.has(n.id()));
  const arr = nodes.toArray();
  const overlaps = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      const pa = a.position(), pb = b.position();
      // Use data('size') because headless outerWidth() returns 1
      const rA = a.data('size') / 2;
      const rB = b.data('size') / 2;
      const dist = Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2);
      const minDist = rA + rB;
      if (dist < minDist) {
        overlaps.push({ a: a.id(), b: b.id(), depth: +(minDist - dist).toFixed(1) });
      }
    }
  }
  return overlaps;
}

async function testLayout(label, opts, useCompound) {
  const cy = cytoscape({
    headless: true,
    elements: buildElements(useCompound),
  });

  const result = await runLayout(cy, opts);

  if (result instanceof Error) {
    console.log(`  [${label}]  ❌ crash: ${result.message.split('\n')[0]}`);
    return { ok: false, crash: true };
  }

  const overlaps = checkOverlaps(cy);
  const worst = overlaps.length > 0
    ? Math.max(...overlaps.map(o => o.depth)).toFixed(1)
    : null;

  if (overlaps.length === 0) {
    console.log(`  [${label}]  ✅ PASS  no overlaps`);
    return { ok: true, crash: false, overlaps: 0 };
  } else {
    console.log(`  [${label}]  ❌ FAIL  overlaps=${overlaps.length}  worst=${worst}px`);
    return { ok: false, crash: false, overlaps: overlaps.length, worst };
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  S1 Layout Comparison  (cytoscape ${cytoscape.version})`);
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('── A. fcose ────────────────────────────────────────────────');

  const fcoseBase = {
    name: 'fcose', animate: false, randomize: true,
    nodeRepulsion: () => 8000, nodeSeparation: 20, numIter: 2500,
  };

  await testLayout('fcose flat, default repulsion', fcoseBase, false);
  await testLayout('fcose flat, high repulsion', {
    ...fcoseBase, nodeRepulsion: () => 100000, quality: 'proof', numIter: 5000,
  }, false);
  await testLayout('fcose compound', fcoseBase, true);

  console.log('\n── B. cose-bilkent ─────────────────────────────────────────');

  const coseBilkentBase = {
    name: 'cose-bilkent', animate: false, randomize: true,
    nodeRepulsion: 8000, nodeSeparation: 20, numIter: 2500, idealEdgeLength: 120,
  };

  await testLayout('cose-bilkent flat, default', coseBilkentBase, false);
  await testLayout('cose-bilkent flat, high repulsion', {
    ...coseBilkentBase, nodeRepulsion: 100000,
  }, false);
  await testLayout('cose-bilkent compound', coseBilkentBase, true);
  await testLayout('cose-bilkent compound, high repulsion', {
    ...coseBilkentBase, nodeRepulsion: 100000,
  }, true);

  console.log('\n── C. cola ─────────────────────────────────────────────────');

  const colaBase = {
    name: 'cola', animate: false, randomize: true,
    nodeSpacing: 20, edgeLength: 120, maxSimulationTime: 8000,
    avoidOverlaps: true,  // key feature of cola
    handleDisconnected: true,
  };

  await testLayout('cola flat, avoidOverlaps=true', colaBase, false);
  await testLayout('cola compound, avoidOverlaps=true', colaBase, true);

  console.log('\n── D. fcose flat + manual separation pass ──────────────────');

  // Best real-world approach: flat layout, then push-apart overlapping nodes
  const cy = cytoscape({
    headless: true,
    elements: buildElements(false),
  });

  await runLayout(cy, { name: 'fcose', animate: false, nodeRepulsion: () => 8000, numIter: 2500 });

  // Separation pass: repeatedly push overlapping nodes apart
  let passCount = 0;
  const MAX_PASSES = 20;
  while (passCount < MAX_PASSES) {
    const factionIds = new Set(FACTIONS.map(f => f.id));
    const nodes = cy.nodes().filter(n => !factionIds.has(n.id())).toArray();
    let moved = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const pa = a.position(), pb = b.position();
        const rA = a.data('size') / 2;
        const rB = b.data('size') / 2;
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minDist = rA + rB + 10; // 10px gap
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.position({ x: pa.x - nx * push, y: pa.y - ny * push });
          b.position({ x: pb.x + nx * push, y: pb.y + ny * push });
          moved++;
        }
      }
    }
    if (moved === 0) break;
    passCount++;
  }

  const overlaps = checkOverlaps(cy);
  console.log(`  [fcose + separation (${passCount} passes)]  ${overlaps.length === 0 ? '✅ PASS  no overlaps' : `❌ FAIL  overlaps=${overlaps.length}`}`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Recommendation:');
  console.log('  • fcose compound nodes → crash in cose-base (known bug)');
  console.log('  • Check if cose-bilkent/cola handle compounds without crash');
  console.log('  • Fallback plan: flat layout + rendered faction backgrounds');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(2);
});
