<script setup lang="ts">
import { ref, computed } from 'vue';
import { normalLoot, type Loot } from './normalLoot';
import { uniqueLoot } from './uniqueLoot';

/* -----------------------------
   Constants
----------------------------- */

const TEAM_UNIQUE_CHANCE = 0.1099;
const MAX_HISTORY = 50;

/* -----------------------------
   Reactive State
----------------------------- */

const obtainedCounts = ref<Record<number, number>>({});
const rollHistory = ref<number[]>([]);
const uniqueDropKc = ref<Map<number, number[]>>(new Map());

const rollAmount = ref(1);
const rollCount = ref(0);

const ffaEnabled = ref(true);
const teamSize = ref(3);
const mvpPoints = ref(4);

const purpleActive = ref(false);
const totalUniques = ref(0);

/* -----------------------------
   Computed Values
----------------------------- */

const playerScore = computed(() => 18 + mvpPoints.value);
const teamScore = computed(() => 14 + teamSize.value * 18);

const computedUniqueChance = computed(() => {
  if (!ffaEnabled.value) return TEAM_UNIQUE_CHANCE;
  return TEAM_UNIQUE_CHANCE * (playerScore.value / teamScore.value);
});

const itemMap = computed<Record<number, Loot>>(() =>
  Object.fromEntries([...normalLoot.value, ...uniqueLoot.value].map((i) => [i.id, i])),
);

const totalLoot = computed(() =>
  Object.entries(obtainedCounts.value)
    .map(([id, count]) => ({
      id: Number(id),
      count,
    }))
    .sort((a, b) => b.id - a.id),
);

const uniques = computed(() => uniqueLoot.value.filter((i) => i.unique));

const collectionProgress = computed(() => {
  const owned = uniques.value.filter((u) => obtainedCounts.value[u.id]).length;
  return `${owned}/${uniques.value.length}`;
});

/* -----------------------------
   Weighted Roll Optimization
----------------------------- */

type WeightedEntry = {
  item: Loot;
  cumulative: number;
};

function buildWeightTable(table: Loot[]): WeightedEntry[] {
  let cumulative = 0;

  return table.map((item) => {
    cumulative += item.weight;
    return { item, cumulative };
  });
}

const normalWeightTable = buildWeightTable(normalLoot.value);
const uniqueWeightTable = buildWeightTable(uniqueLoot.value);

const normalTotalWeight = normalWeightTable.at(-1)!.cumulative;
const uniqueTotalWeight = uniqueWeightTable.at(-1)!.cumulative;

function weightedRollFast(table: WeightedEntry[], totalWeight: number): Loot {
  const roll = Math.random() * totalWeight;

  for (const entry of table) {
    if (roll <= entry.cumulative) {
      return entry.item;
    }
  }

  return table[0].item;
}

/* -----------------------------
   Utility Functions
----------------------------- */

function rollQuantity(item: Loot): number {
  const min = item.minQty ?? 1;
  const max = item.maxQty ?? min;

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function recordUniqueDrop(itemId: number, kc: number) {
  if (!uniqueDropKc.value.has(itemId)) {
    uniqueDropKc.value.set(itemId, []);
  }

  uniqueDropKc.value.get(itemId)!.push(kc);
  totalUniques.value += 1;
}

/* -----------------------------
   Purple Logic
----------------------------- */

function rollPurple(playerShare: number): boolean {
  if (ffaEnabled.value) {
    if (Math.random() < TEAM_UNIQUE_CHANCE) {
      return Math.random() < playerShare;
    }
    return false;
  }

  return Math.random() < computedUniqueChance.value;
}

/* -----------------------------
   Public Actions
----------------------------- */

function roll() {
  purpleActive.value = false;

  const counts = { ...obtainedCounts.value };
  const history: number[] = [];

  const playerShare = playerScore.value / teamScore.value;

  for (let i = 0; i < rollAmount.value; i++) {
    const kc = rollCount.value;

    if (rollPurple(playerShare)) {
      const item = weightedRollFast(uniqueWeightTable, uniqueTotalWeight);
      const qty = rollQuantity(item);

      counts[item.id] = (counts[item.id] || 0) + qty;
      history.unshift(item.id);

      recordUniqueDrop(item.id, kc);

      purpleActive.value = true;
    } else {
      for (let j = 0; j < 3; j++) {
        const item = weightedRollFast(normalWeightTable, normalTotalWeight);
        const qty = rollQuantity(item);

        counts[item.id] = (counts[item.id] || 0) + qty;
        history.unshift(item.id);
      }
    }

    rollCount.value++;
  }

  rollHistory.value = [...history, ...rollHistory.value].slice(0, MAX_HISTORY);
  obtainedCounts.value = counts;
}

function reset() {
  obtainedCounts.value = {};
  rollHistory.value = [];
  uniqueDropKc.value.clear();
  rollCount.value = 0;
  purpleActive.value = false;
  totalUniques.value = 0;
}
</script>

<template>
  <main class="main" :class="{ purple: purpleActive }">
    <header>
      <h1>Theatre of Blood Loot Simulator</h1>
    </header>

    <section class="panel controls">
      <header class="top-controls">
        <div class="roll-group">
          <button class="primary" @click="roll">Roll</button>

          <label class="inline-input">
            Rolls
            <input type="number" v-model.number="rollAmount" min="1" />
          </label>
        </div>

        <button class="danger" @click="reset">Reset</button>
      </header>

      <button class="toggle" @click="ffaEnabled = !ffaEnabled">
        {{ ffaEnabled ? 'FFA Enabled' : 'FFA Disabled' }}
      </button>

      <section class="settings">
        <label>
          Team Size
          <select v-model.number="teamSize">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>

        <label>
          Personal MVP Points (0-14)
          <input type="number" v-model.number="mvpPoints" min="0" max="14" />
        </label>
      </section>

      <dl class="info">
        <div class="stat">
          <dt class="label">Player Score</dt>
          <dd class="value">{{ playerScore }}</dd>
        </div>

        <div class="stat">
          <dt class="label">Team Score</dt>
          <dd class="value">{{ teamScore }}</dd>
        </div>

        <div class="stat">
          <dt class="label">Team Unique</dt>
          <dd class="value highlight">{{ (TEAM_UNIQUE_CHANCE * 100).toFixed(2) }}%</dd>
        </div>

        <div class="stat">
          <dt class="label">Your Unique</dt>
          <dd class="value purple">{{ (computedUniqueChance * 100).toFixed(2) }}%</dd>
        </div>
      </dl>
    </section>

    <section class="panel">
      <header>
        <h2>Total Loot: {{ rollCount }} rolls</h2>
        <span>Total Uniques: {{ totalUniques }}</span>
      </header>

      <ul class="loot-grid">
        <li v-for="item in totalLoot" :key="item.id" class="item">
          <img :src="itemMap[item.id]?.img" />

          <div class="count" v-if="item.count">x{{ item.count }}</div>

          <div v-if="uniqueDropKc.get(item.id)" class="kc-tooltip">
            KC: {{ uniqueDropKc.get(item.id)?.join(', ') }}
          </div>
        </li>
      </ul>
    </section>

    <section class="panel">
      <header>
        <h2>Collection Log</h2>
        <p>Collection Log: {{ collectionProgress }}</p>
      </header>

      <ul class="items-grid">
        <li
          v-for="item in uniqueLoot"
          :key="item.id"
          class="item"
          :class="{ greyed: !obtainedCounts[item.id] }"
        >
          <img :src="item.img" />

          <div class="count" v-if="obtainedCounts[item.id]">x{{ obtainedCounts[item.id] }}</div>

          <div v-if="uniqueDropKc.get(item.id)" class="kc-tooltip">
            KC: {{ uniqueDropKc.get(item.id)?.join(', ') }}
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}

.main {
  background: radial-gradient(circle at center, #3b3b40 0%, #3b3b40 70%);
  color: #e6e6e6;
  min-height: 100vh;
  padding: 32px;
  font-family: system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: background 0.35s ease;
}

.main.purple {
  background: radial-gradient(circle at center, #3b3b40 0%, #6c1dad 70%);
}

h1 {
  margin-bottom: 20px;
}

.buttons button {
  margin-right: 8px;
}

.loot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 46px);
  gap: 1.5rem;
  align-items: end;
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 46px);
  gap: 1.5rem;
  align-items: end;
}

.item {
  position: relative;
  width: 46px;
  height: 46px;
}

img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.greyed {
  filter: grayscale(100%);
  opacity: 0.35;
}

.count {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: black;
  padding: 2px 4px;
  font-size: 12px;
  border-radius: 4px;
}

.panel {
  background: #1a1a1d;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  width: 50%;
}

/* ---------- Layout ---------- */

.controls {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.top-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.roll-group {
  display: flex;
  gap: 14px;
  align-items: center;
}

.settings {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 15px;
  font-weight: 500;
}

.inline-input {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  height: 3rem;
}

/* ---------- Inputs ---------- */

input,
select {
  background: #26262b;
  border: 1px solid #3a3a40;
  color: white;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 15px;
  width: 80px;
}

input:focus,
select:focus {
  outline: none;
  border-color: #6b8cff;
  box-shadow: 0 0 0 2px rgba(107, 140, 255, 0.25);
}

/* ---------- Buttons ---------- */

button {
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 15px;
  transition: all 0.15s ease;
}

button.primary {
  background: linear-gradient(135deg, #4f7cff, #6b8cff);
  color: white;
  width: 15rem;
  height: 3rem;
}

button.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
}

button.toggle {
  background: #2a2a2e;
  color: #e6e6e6;
}

button.toggle:hover {
  background: #3a3a40;
}

button.danger {
  background: #8b2f2f;
  color: white;
  width: 15rem;
  height: 3rem;
}

button.danger:hover {
  background: #a33a3a;
}

/* ---------- Info text ---------- */

.info {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  font-size: 15px;
  color: #cfcfcf;
  align-items: center;
  justify-content: center;
  padding-top: 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
}
.stat .label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9a9aa0;
}

.stat .value {
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
}

.stat .value.highlight {
  color: #6aa7ff;
}

.stat .value.purple {
  color: #c77dff;
}

.kc-tooltip {
  position: absolute;
  bottom: 52px;
  left: 50%;
  transform: translateX(-50%);

  background: #0b0b0c;
  border: 1px solid #444;
  padding: 6px 8px;
  border-radius: 6px;

  font-size: 12px;
  white-space: nowrap;

  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.item:hover .kc-tooltip {
  opacity: 1;
}
ul {
  list-style-type: none;
}
</style>
