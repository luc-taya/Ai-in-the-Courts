// Headless rule tests: node --test catan/test/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const loadGame = require('./load');

const C = loadGame();
const { RES, GEO, CONFIG } = C;

function totals(G) {
  const t = {};
  for (const r of RES) t[r] = G.bank[r] + G.players.reduce((s, p) => s + p.res[r], 0);
  return t;
}
function assertConservation(G, where) {
  const t = totals(G);
  for (const r of RES) {
    assert.strictEqual(t[r], CONFIG.BANK_PER_RESOURCE, `${r} total ${t[r]} at ${where}`);
    assert.ok(G.bank[r] >= 0, `bank ${r} negative at ${where}`);
    for (const p of G.players) assert.ok(p.res[r] >= 0, `${p.name} ${r} negative at ${where}`);
  }
}
function runSetupWithBots(G) {
  while (G.phase === 'setup') assert.ok(C.botAct(C.actorId()), 'bot setup action failed');
}
/** A game past setup with an empty board: all-bot seats, player 0 to roll. */
function blankGame(n = 4, seed = 99) {
  const G = C.newGame({ numPlayers: n, humanSeat: null, seed });
  G.pending = null; G.queue = []; G.phase = 'roll'; G.turn = 0; G.turnNumber = 1;
  G.robber = G.hexes.findIndex(h => h.terrain === 'desert');
  return G;
}
function grant(G, pid, r, n) { G.bank[r] -= n; G.players[pid].res[r] += n; }
function giveCard(G, pid, type) { G.players[pid].dev.push({ type, bought: 0 }); }
const handSize = p => RES.reduce((s, r) => s + p.res[r], 0);
const diceFor = n => { const a = Math.max(1, n - 6); return [a, n - a]; };

test('geometry: 19 hexes, 54 vertices, 72 edges, 30 coastal edges', () => {
  assert.strictEqual(GEO.hexes.length, 19);
  assert.strictEqual(GEO.verts.length, 54);
  assert.strictEqual(GEO.edges.length, 72);
  assert.strictEqual(GEO.coast.length, 30);
});

test('board: terrain counts, tokens, no adjacent 6/8, robber on desert, 9 spaced ports', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const G = C.newGame({ numPlayers: 4, humanSeat: null, seed });
    const count = {};
    G.hexes.forEach(h => { count[h.terrain] = (count[h.terrain] || 0) + 1; });
    assert.deepStrictEqual({ ...count }, { ...CONFIG.TERRAIN });
    const nums = [...G.hexes.map(h => h.number).filter(Boolean)].sort((a, b) => a - b);
    assert.deepStrictEqual(nums, [...CONFIG.NUMBER_TOKENS].sort((a, b) => a - b));
    assert.strictEqual(G.hexes[G.hexes.findIndex(h => h.terrain === 'desert')].number, null);
    for (const h of GEO.hexes) {
      const hot = n => n === 6 || n === 8;
      if (hot(G.hexes[h.id].number)) for (const j of h.nbrs) assert.ok(!hot(G.hexes[j].number), `adjacent 6/8 seed ${seed}`);
    }
    assert.strictEqual(G.hexes[G.robber].terrain, 'desert');
    assert.strictEqual(G.ports.length, 9);
    assert.strictEqual(G.ports.filter(p => p.type === 'any').length, 4);
    assert.deepStrictEqual([...G.ports.filter(p => p.type !== 'any').map(p => p.type)].sort(), ['brick', 'grain', 'ore', 'wood', 'wool']);
    const used = new Set();
    for (const p of G.ports) {
      const e = GEO.edges[p.edge];
      assert.strictEqual(e.hexes.length, 1, 'port not on coast');
      assert.ok(!used.has(e.a) && !used.has(e.b), 'ports share a vertex');
      used.add(e.a); used.add(e.b);
    }
    // spacing along the coast: gaps of 3 or 4 edges
    const idx = G.ports.map(p => GEO.coast.indexOf(p.edge)).sort((a, b) => a - b);
    idx.forEach((v, i) => {
      const gap = ((idx[(i + 1) % 9] - v) + 30) % 30;
      assert.ok(gap === 3 || gap === 4, `port gap ${gap}`);
    });
    assert.strictEqual(G.devDeck.length, Object.values(CONFIG.DEV_DECK).reduce((a, b) => a + b, 0));
  }
});

test('setup: snake order, second settlement pays adjacent resources', () => {
  const G = C.newGame({ numPlayers: 4, humanSeat: null, seed: 5 });
  assert.deepStrictEqual([...G.setupOrder], [0, 1, 2, 3, 3, 2, 1, 0]);
  const seen = [];
  while (G.phase === 'setup') {
    const pd = G.pending;
    if (pd.kind === 'setupSettle') seen.push(pd.pid);
    const before = handSize(G.players[pd.pid]);
    assert.ok(C.botAct(pd.pid));
    if (pd.kind === 'setupSettle') {
      const v = G.buildings.findIndex((b, i) => b && b.owner === pd.pid && G.pending.vertex === i);
      const land = GEO.verts[v].hexes.filter(h => G.hexes[h].terrain !== 'desert').length;
      const gained = handSize(G.players[pd.pid]) - before;
      assert.strictEqual(gained, seen.length > 4 ? land : 0);
    }
    assertConservation(G, 'setup');
  }
  assert.deepStrictEqual(seen, [0, 1, 2, 3, 3, 2, 1, 0]);
  for (const p of G.players) {
    assert.strictEqual(p.pieces.settlement, 3);
    assert.strictEqual(p.pieces.road, 13);
  }
});

for (const n of [3, 4]) {
  test(`bot-only simulations (${n} players) run to completion, resources always total 19`, () => {
    const SEEDS = 25;
    let wins = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const G = C.newGame({ numPlayers: n, humanSeat: null, seed: seed * 7919 + n });
      let steps = 0;
      while (G.phase !== 'over' && steps < 40000) {
        const a = C.actorId();
        assert.ok(C.botAct(a), `bot ${a} failed to act (seed ${G.seed}, pending ${G.pending && G.pending.kind}, phase ${G.phase})`);
        assertConservation(G, `seed ${G.seed} step ${steps}`);
        for (const p of G.players) {
          assert.ok(p.pieces.road >= 0 && p.pieces.settlement >= 0 && p.pieces.city >= 0);
          assert.strictEqual(G.roads.filter(o => o === p.id).length, CONFIG.LIMITS.road - p.pieces.road);
        }
        steps++;
      }
      assert.strictEqual(G.phase, 'over', `seed ${G.seed} did not finish (turn ${G.turnNumber})`);
      assert.ok(C.vpOf(G.winner) >= CONFIG.VP_TO_WIN);
      wins++;
    }
    assert.strictEqual(wins, SEEDS);
  });
}

test('Ward: playable on an opponent\'s turn, blocks the 7-discard and is consumed', () => {
  const G = blankGame();
  G.turn = 1; G.turnNumber = 5;                // a bot's turn
  giveCard(G, 0, 'ward');
  assert.ok(C.canPlayDev(0, 'ward'));
  assert.ok(C.playDev(0, 'ward'));
  assert.strictEqual(G.players[0].wardActive, true);
  assert.strictEqual(G.players[0].dev.length, 0);
  assert.strictEqual(G.pending, null);
  grant(G, 0, 'wood', 5); grant(G, 0, 'ore', 4);   // 9 cards
  grant(G, 2, 'grain', 9);                         // no ward
  assert.ok(C.rollDice(1, [3, 4]));
  const kinds = [G.pending, ...G.queue].map(p => `${p.kind}:${p.pid}`);
  assert.ok(!kinds.includes('discard:0'), 'warded player must not discard');
  assert.ok(kinds.includes('discard:2'), 'unwarded player discards');
  assert.strictEqual(G.players[0].wardActive, false, 'ward consumed');
  assert.strictEqual(handSize(G.players[0]), 9);
  // next 7: no ward any more → must discard
  while (G.pending) C.botAct(C.actorId());
  assert.ok(C.endTurn(1));
  assert.ok(C.rollDice(2, [6, 1]));
  assert.ok([G.pending, ...G.queue].some(p => p.kind === 'discard' && p.pid === 0));
  assertConservation(G, 'ward');
});

test('Ward: not consumed when the holder has 7 or fewer cards; cannot stack; not while a choice is pending', () => {
  const G = blankGame();
  giveCard(G, 0, 'ward'); giveCard(G, 0, 'ward');
  assert.ok(C.playDev(0, 'ward'));
  assert.strictEqual(C.canPlayDev(0, 'ward'), false, 'second ward while one is active');
  grant(G, 0, 'wood', 3);
  assert.ok(C.rollDice(0, [2, 5]));
  assert.strictEqual(G.players[0].wardActive, true);
  assert.strictEqual(G.pending.kind, 'robber');
  G.players[0].wardActive = false;
  assert.strictEqual(C.canPlayDev(0, 'ward'), false, 'blocked while a choice is pending');
});

test('Pickpocket: any time, steals exactly one card from the chosen opponent', () => {
  const G = blankGame();
  G.turn = 2; G.turnNumber = 7; G.phase = 'main';
  giveCard(G, 0, 'pickpocket');
  grant(G, 1, 'brick', 3); grant(G, 1, 'wool', 2);
  grant(G, 3, 'ore', 4);
  const before = G.players.map(handSize);
  assert.ok(C.playDev(0, 'pickpocket'));
  assert.strictEqual(G.pending.kind, 'pickpocket');
  assert.strictEqual(C.actorId(), 0, 'human-or-bot owner is the actor while choosing');
  assert.strictEqual(C.choosePickpocket(0, 2), false, 'cannot pick an opponent with no cards');
  assert.ok(C.choosePickpocket(0, 1));
  const after = G.players.map(handSize);
  assert.strictEqual(after[0], before[0] + 1);
  assert.strictEqual(after[1], before[1] - 1);
  assert.strictEqual(after[2], before[2]);
  assert.strictEqual(after[3], before[3]);
  assert.strictEqual(G.pending, null);
  assert.strictEqual(G.players[0].dev.length, 0);
  assert.strictEqual(G.turn, 2, 'turn unchanged');
  assertConservation(G, 'pickpocket');
});

test('Blessing of the Harvest: pays only the owner, once, then is consumed', () => {
  const G = blankGame();
  // a hex whose neighbours do not share its number, so only H produces on N for these vertices
  const H = GEO.hexes.find(h => G.hexes[h.id].number && h.id !== G.robber && h.nbrs.every(j => G.hexes[j].number !== G.hexes[h.id].number));
  const N = G.hexes[H.id].number, r = G.hexes[H.id].terrain;
  G.buildings[H.verts[0]] = { owner: 0, type: 'settlement' };
  G.buildings[H.verts[3]] = { owner: 1, type: 'city' };
  giveCard(G, 0, 'blessing');
  assert.ok(C.playDev(0, 'blessing'));
  assert.strictEqual(C.chooseBlessing(0, 7), false);
  assert.ok(C.chooseBlessing(0, N));
  assert.deepStrictEqual([...G.players[0].blessings], [N]);
  const b0 = G.players[0].res[r], b1 = G.players[1].res[r];
  assert.ok(C.rollDice(0, diceFor(N)));
  assert.strictEqual(G.players[0].res[r] - b0, 2, 'owner: 1 base + 1 blessing');
  assert.strictEqual(G.players[1].res[r] - b1, 2, 'opponent city: 2 base, no bonus');
  assert.strictEqual(G.players[0].blessings.length, 0, 'consumed');
  // roll N again on a later turn: base only
  G.phase = 'roll'; G.dice = null; G.turnNumber++;
  const c0 = G.players[0].res[r];
  assert.ok(C.rollDice(0, diceFor(N)));
  assert.strictEqual(G.players[0].res[r] - c0, 1);
  assertConservation(G, 'blessing');
});

test('Standard dev rules: one non-VP card per turn, not on the turn bought; ANY TIME cards exempt', () => {
  const G = blankGame();
  G.phase = 'main';
  giveCard(G, 0, 'knight'); giveCard(G, 0, 'yop'); giveCard(G, 0, 'pickpocket');
  G.players[0].dev.push({ type: 'mono', bought: G.turnNumber });
  assert.strictEqual(C.canPlayDev(0, 'mono'), false, 'bought this turn');
  assert.ok(C.playDev(0, 'yop'));
  assert.ok(C.chooseYop(0, 'ore')); assert.ok(C.chooseYop(0, 'wool'));
  assert.strictEqual(C.canPlayDev(0, 'knight'), false, 'second card this turn');
  grant(G, 2, 'wood', 2);
  assert.ok(C.canPlayDev(0, 'pickpocket'), 'ANY TIME card ignores the per-turn limit');
  assert.strictEqual(C.canPlayDev(1, 'knight'), false);
  assertConservation(G, 'dev rules');
});

test('Longest Road: 4 roads no award, 5th road awards +2 VP; an opponent settlement breaks it', () => {
  const G = blankGame();
  G.phase = 'main';
  // walk a simple path from some vertex
  const start = GEO.verts.find(v => v.edges.length === 3).id;
  G.buildings[start] = { owner: 0, type: 'settlement' };
  const path = [start];
  let tip = start;
  const visited = new Set([start]);
  for (let i = 0; i < 5; i++) {
    const e = GEO.verts[tip].edges.find(e2 => G.roads[e2] === null && !visited.has(GEO.edges[e2].a === tip ? GEO.edges[e2].b : GEO.edges[e2].a));
    grant(G, 0, 'wood', 1); grant(G, 0, 'brick', 1);
    assert.ok(C.doRoad(0, e), `road ${i + 1}`);
    tip = GEO.edges[e].a === tip ? GEO.edges[e].b : GEO.edges[e].a;
    visited.add(tip); path.push(tip);
    if (i === 3) {
      assert.strictEqual(C.longestRoadFor(0), 4);
      assert.strictEqual(G.longestRoad, null);
    }
  }
  assert.strictEqual(C.longestRoadFor(0), 5);
  assert.strictEqual(G.longestRoad, 0);
  assert.strictEqual(C.vpOf(0), 1 + CONFIG.AWARD_VP);
  // opponent builds on the middle of the road → broken into 2 + 3
  G.buildings[path[2]] = { owner: 1, type: 'settlement' };
  C.updateAwards();
  assert.strictEqual(C.longestRoadFor(0), 3);
  assert.strictEqual(G.longestRoad, null);
  assertConservation(G, 'longest road');
});

test('Largest Army: 3 knights awards, ties keep the holder', () => {
  const G = blankGame();
  G.players[1].knights = 3; C.updateAwards();
  assert.strictEqual(G.largestArmy, 1);
  G.players[2].knights = 3; C.updateAwards();
  assert.strictEqual(G.largestArmy, 1, 'tie keeps holder');
  G.players[2].knights = 4; C.updateAwards();
  assert.strictEqual(G.largestArmy, 2);
});

test('Bank shortage: nobody collects a resource the bank cannot cover', () => {
  const G = blankGame();
  const H = GEO.hexes.find(h => G.hexes[h.id].number && h.id !== G.robber);
  const N = G.hexes[H.id].number, r = G.hexes[H.id].terrain;
  G.buildings[H.verts[0]] = { owner: 0, type: 'city' };
  G.buildings[H.verts[3]] = { owner: 1, type: 'city' };
  // leave the bank with 3 of r (demand is 4 + any other hex with N)
  grant(G, 2, r, G.bank[r] - 3);
  const before = G.players.map(p => p.res[r]);
  assert.ok(C.rollDice(0, diceFor(N)));
  assert.deepStrictEqual(G.players.map(p => p.res[r]), before);
  assert.strictEqual(G.bank[r], 3);
  assertConservation(G, 'shortage');
});

test('Bank trade: 4:1 by default, ports lower it', () => {
  const G = blankGame();
  G.phase = 'main';
  assert.strictEqual(C.tradeRate(0, 'wood'), 4);
  const any = G.ports.find(p => p.type === 'any'), spec = G.ports.find(p => p.type === 'ore');
  G.buildings[GEO.edges[any.edge].a] = { owner: 0, type: 'settlement' };
  assert.strictEqual(C.tradeRate(0, 'wood'), 3);
  G.buildings[GEO.edges[spec.edge].a] = { owner: 0, type: 'settlement' };
  assert.strictEqual(C.tradeRate(0, 'ore'), 2);
  grant(G, 0, 'ore', 2);
  assert.ok(C.bankTrade(0, 'ore', 'grain'));
  assert.strictEqual(G.players[0].res.grain, 1);
  assert.strictEqual(G.players[0].res.ore, 0);
  assertConservation(G, 'trade');
});

test('Building rules: distance rule, road connectivity, opponent buildings block roads, limits', () => {
  const G = blankGame();
  G.phase = 'main';
  const v = GEO.verts.find(x => x.edges.length === 3).id;
  G.buildings[v] = { owner: 0, type: 'settlement' };
  const e = GEO.verts[v].edges[0], w = GEO.edges[e].a === v ? GEO.edges[e].b : GEO.edges[e].a;
  grant(G, 0, 'wood', 4); grant(G, 0, 'brick', 4); grant(G, 0, 'wool', 1); grant(G, 0, 'grain', 1);
  assert.ok(C.doRoad(0, e));
  assert.strictEqual(C.doSettle(0, w), false, 'distance rule');
  // opponent settles at the far end of a second road; we cannot road through it
  const e2 = GEO.verts[w].edges.find(x => x !== e);
  const far = GEO.edges[e2].a === w ? GEO.edges[e2].b : GEO.edges[e2].a;
  assert.ok(C.doRoad(0, e2));
  G.buildings[far] = { owner: 1, type: 'settlement' };
  for (const e3 of GEO.verts[far].edges) if (e3 !== e2) assert.strictEqual(C.canRoad(0, e3), false);
  // an unconnected edge is never valid
  const lonely = GEO.edges.find(x => ![x.a, x.b].some(u => GEO.verts[u].edges.some(y => G.roads[y] === 0)) && G.buildings[x.a] === null && G.buildings[x.b] === null);
  assert.strictEqual(C.canRoad(0, lonely.id), false);
  G.players[0].pieces.road = 0;
  assert.strictEqual(C.validRoadEdges(0).length > 0, true);
  assert.strictEqual(C.doRoad(0, C.validRoadEdges(0)[0]), false, 'road limit');
});
