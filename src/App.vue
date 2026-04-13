<script setup lang="ts">
import { ref, computed, type Ref, onUnmounted } from 'vue';
import { normalLoot, type Loot } from './normalLoot';
import { uniqueLoot } from './uniqueLoot';

/* -----------------------------
   Constants
----------------------------- */

const TEAM_UNIQUE_CHANCE = 0.1099;
const MAX_HISTORY = 50;

const PET_ITEM: Loot = {
  id: 999,
  name: 'Lil’ Zik',
  img: '/osrs-tob-loot-simulator/items/lil_zik.png',
  unique: true,
  weight: 0,
};

/* -----------------------------
   Reactive State
----------------------------- */

const obtainedCounts = ref<Record<number, number>>({});
const rollHistory = ref<number[]>([]);
const uniqueDropKc = ref<Map<number, number[]>>(new Map());
const petDropKc = ref<number[]>([]);

const rollAmount = ref(1);
const rollCount = ref(0);

const autoRollEnabled = ref(false);
const autoRollStopMode = ref<'any' | 'new' | 'chosen'>('any');
const selectedUniqueId = ref<number | null>(106);
const autoRollIntervalId: Ref<number | null> = ref(null);

const ffaEnabled = ref(true);
const teamSize = ref(3);
const mvpPoints = ref(4);

const purpleActive = ref(false);
const totalUniques = ref(0);

/* -----------------------------
   Computed Values
----------------------------- */

const isAutoRolling = computed(() => autoRollIntervalId.value !== null);
const playerScore = computed(() => 18 + mvpPoints.value);
const teamScore = computed(() => 14 + teamSize.value * 18);

const computedUniqueChance = computed(() => {
  if (!ffaEnabled.value) return TEAM_UNIQUE_CHANCE;
  return TEAM_UNIQUE_CHANCE * (playerScore.value / teamScore.value);
});

const itemMap = computed<Record<number, Loot>>(() =>
  Object.fromEntries([...normalLoot.value, ...uniqueLoot.value, PET_ITEM].map((i) => [i.id, i])),
);

const totalLoot = computed(() =>
  Object.entries(obtainedCounts.value)
    .map(([id, count]) => ({ id: Number(id), count }))
    .sort((a, b) => b.id - a.id),
);

const uniques = computed(() => [...uniqueLoot.value.filter((i) => i.unique), PET_ITEM]);

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
    if (roll <= entry.cumulative) return entry.item;
  }
  return table[0]!.item;
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
}

function hasKc(itemId: number) {
  if (itemId === PET_ITEM.id) {
    return petDropKc.value.length > 0;
  }
  return !!uniqueDropKc.value.get(itemId)?.length;
}

function formatKcList(list: number[]): string {
  if (list.length <= 15) return list.join(', ');
  return [...list.slice(0, 3), '...', ...list.slice(-5)].join(', ');
}

/* -----------------------------
   Roll Logic
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

function rollPet() {
  return Math.random() < 1 / 650;
}

/* -----------------------------
   Core Roll Function
----------------------------- */

type RollResult = {
  uniqueDropped: boolean;
  uniqueId?: number;
  isNew?: boolean;
  petDropped: boolean;
};

function roll(forcedAmount?: number): RollResult {
  purpleActive.value = false;

  const counts = { ...obtainedCounts.value };
  const history: number[] = [];

  const playerShare = playerScore.value / teamScore.value;

  let result: RollResult = {
    uniqueDropped: false,
    petDropped: false,
    isNew: false,
  };

  const rollsToPerform = forcedAmount ?? rollAmount.value;

  for (let i = 0; i < rollsToPerform; i++) {
    const kc = rollCount.value + 1;
    let petDropped = false;

    /* ---- Pet roll ---- */
    if (rollPet()) {
      petDropKc.value.push(kc);
      counts[PET_ITEM.id] = (counts[PET_ITEM.id] || 0) + 1;
      history.unshift(PET_ITEM.id);

      result.petDropped = true;
    }

    /* ---- Unique roll ---- */
    if (rollPurple(playerShare)) {
      const item = weightedRollFast(uniqueWeightTable, uniqueTotalWeight);
      const qty = rollQuantity(item);

      const isNew = !uniqueDropKc.value.has(item.id);

      counts[item.id] = (counts[item.id] || 0) + qty;
      history.unshift(item.id);

      recordUniqueDrop(item.id, kc);
      totalUniques.value += 1;

      result.uniqueDropped = true;
      result.uniqueId = item.id;
      result.isNew = isNew;

      if (!autoRollEnabled.value) {
        // Manual roll → always show purple
        purpleActive.value = true;
      } else {
        // Auto-roll → only show if this roll will stop it
        if (shouldStopAutoRoll(result)) {
          purpleActive.value = true;
        }
      }
    } else {
      /* ---- Normal rolls ---- */
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

  if (autoRollEnabled.value && !autoRollIntervalId.value) {
    startAutoRoll();
  }

  return result;
}

/* -----------------------------
   Auto Roll Logic
----------------------------- */

function shouldStopAutoRoll(result: RollResult): boolean {
  if (!autoRollStopMode.value || (!result.uniqueDropped && !result.petDropped)) {
    return false;
  }

  switch (autoRollStopMode.value) {
    case 'any':
      return true;

    case 'new':
      return !!result.isNew;

    case 'chosen':
      if (selectedUniqueId.value === PET_ITEM.id) {
        return result.petDropped;
      }

      return result.uniqueId === selectedUniqueId.value;

    default:
      return false;
  }
}

function startAutoRoll() {
  if (autoRollIntervalId.value) return;

  autoRollIntervalId.value = setInterval(() => {
    const result = roll(1);
    if (shouldStopAutoRoll(result)) {
      stopAutoRoll();
    }
  }, 50);
}

function stopAutoRoll() {
  if (autoRollIntervalId.value) {
    clearInterval(autoRollIntervalId.value);
    autoRollIntervalId.value = null;
  }
}

/* -----------------------------
   Reset
----------------------------- */

function reset() {
  stopAutoRoll();
  obtainedCounts.value = {};
  rollHistory.value = [];
  uniqueDropKc.value.clear();
  petDropKc.value = [];
  rollCount.value = 0;
  purpleActive.value = false;
  totalUniques.value = 0;
}

onUnmounted(() => {
  stopAutoRoll();
});
</script>

<template>
  <main class="main" :class="{ purple: purpleActive }">
    <header>
      <h1>Theatre of Blood Loot Simulator</h1>
    </header>

    <section class="panel controls">
      <header class="top-controls">
        <div class="roll-group">
          <button class="primary" @click="roll(rollAmount)" :disabled="isAutoRolling">
            {{ isAutoRolling ? 'Rolling...' : 'Roll' }}
          </button>

          <button v-if="isAutoRolling" class="danger" @click="stopAutoRoll">Stop</button>

          <label v-if="!autoRollEnabled" class="inline-input">
            Rolls
            <input type="number" v-model.number="rollAmount" :disabled="isAutoRolling" min="1" />
          </label>
        </div>

        <button class="danger" @click="reset" :disabled="isAutoRolling">Reset Loot</button>
      </header>

      <div class="auto-roll-options">
        <label class="toggle-switch">
          <input type="checkbox" v-model="autoRollEnabled" :disabled="isAutoRolling" />
          <span class="slider"></span>
          <span class="toggle-label">Auto Roll</span>
        </label>
        <div v-if="autoRollEnabled" class="stop-on-options">
          <label>Stop On</label>
          <select v-model="autoRollStopMode" :disabled="isAutoRolling">
            <option value="any">Any Unique</option>
            <option value="new">New Unique</option>
            <option value="chosen">Chosen Unique</option>
          </select>
          <div v-if="autoRollEnabled && autoRollStopMode === 'chosen'" class="stop-on-options">
            <label> Target Unique </label>
            <select v-model.number="selectedUniqueId" :disabled="isAutoRolling">
              <option v-for="item in uniqueLoot" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
              <option :value="PET_ITEM.id">{{ PET_ITEM.name }}</option>
            </select>
          </div>
        </div>
      </div>

      <button class="toggle" @click="ffaEnabled = !ffaEnabled" :disabled="isAutoRolling">
        {{ ffaEnabled ? 'FFA Enabled' : 'FFA Disabled' }}
      </button>

      <section class="settings">
        <label>
          Team Size
          <select v-model.number="teamSize" :disabled="isAutoRolling">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>

        <label>
          Personal MVP Points (0-14)
          <input
            type="number"
            v-model.number="mvpPoints"
            min="0"
            max="14"
            :disabled="isAutoRolling"
          />
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
        <p>Total Uniques: {{ totalUniques }}</p>
      </header>

      <ul class="loot-grid">
        <li v-for="item in totalLoot" :key="item.id" class="item">
          <img :src="itemMap[item.id]?.img" />

          <div class="count" v-if="item.count">x{{ item.count }}</div>

          <div v-if="hasKc(item.id)" class="kc-tooltip">
            KC:
            {{
              item.id === PET_ITEM.id
                ? formatKcList(petDropKc)
                : formatKcList(uniqueDropKc.get(item.id) ?? [])
            }}
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
          v-for="item in uniques"
          :key="item.id"
          class="item"
          :class="{ greyed: !obtainedCounts[item.id] }"
        >
          <img :src="item.img" />

          <div class="count" v-if="obtainedCounts[item.id]">x{{ obtainedCounts[item.id] }}</div>

          <div v-if="hasKc(item.id)" class="kc-tooltip">
            KC:
            {{
              item.id === PET_ITEM.id
                ? formatKcList(petDropKc)
                : formatKcList(uniqueDropKc.get(item.id) ?? [])
            }}
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

/* ---------- Base ---------- */

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

/* ---------- Headings ---------- */

h1 {
  margin-bottom: 20px;
  color: #ff4d4d;
  text-shadow: 0 0 12px rgba(255, 60, 60, 0.35);
}

h2 {
  color: #ff6a6a;
}

/* ---------- Panels ---------- */

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
  gap: 12px;
  flex-wrap: wrap;
}

.roll-group {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.inline-input input {
  width: 70px;
}

/* ---------- Mobile Layout ---------- */

@media (max-width: 600px) {
  .top-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .roll-group {
    width: 100%;
    justify-content: space-between;
  }

  button.primary,
  button.danger {
    width: 100%;
  }

  .roll-group button {
    flex: 1;
  }

  .inline-input {
    width: 100%;
    justify-content: space-between;
  }

  .inline-input input {
    width: 80px;
  }
}

.settings {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  align-items: flex-end;
}

/* ---------- Auto Roll ---------- */

.auto-roll-options {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
}

.stop-on-options {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* ---------- Forms ---------- */

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 15px;
  font-weight: 500;
  color: #d0d0d5;
}

.inline-input {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  height: 3rem;
}

input,
select {
  background: #26262b;
  border: 1px solid #3a3a40;
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 15px;
  min-width: 100px;
}

select {
  min-width: 160px;
  max-width: 220px;
  text-overflow: ellipsis;
}

input:focus,
select:focus {
  outline: none;
  border-color: #ff4d4d;
  box-shadow: 0 0 0 2px rgba(255, 60, 60, 0.25);
}

input:disabled,
select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button.primary {
  background: linear-gradient(135deg, #3a0f5c, #6c1dad);
  color: white;
  width: 15rem;
  height: 3rem;
  box-shadow: 0 0 12px rgba(108, 29, 173, 0.45);
}

button.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(108, 29, 173, 0.65);
}

button.danger {
  background: linear-gradient(135deg, #5c0a0a, #a31515);
  color: white;
  width: 15rem;
  height: 3rem;
}

button.danger:hover:not(:disabled) {
  background: linear-gradient(135deg, #7a0f0f, #c21f1f);
}

/* Toggle button */
button.toggle {
  background: #2a2a2e;
  color: #e6e6e6;
}

button.toggle:hover {
  background: #3a3a40;
}

/* ---------- Loot Grids ---------- */

.loot-grid,
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

/* ---------- Count Badge ---------- */

.count {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: black;
  padding: 2px 4px;
  font-size: 12px;
  border-radius: 4px;
}

/* ---------- Tooltip ---------- */

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

/* ---------- Info Panel ---------- */

.info {
  display: flex;
  gap: 24px;
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
  align-items: center;
  min-width: 100px;
}

.stat .label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8f8f95;
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

/* ---------- Toggle Switch ---------- */

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.slider {
  position: relative;
  width: 42px;
  height: 22px;
  background: #2a2a2e;
  border-radius: 999px;
  transition: background 0.25s ease;
}

.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 2px;
  top: 2px;
  background: #ccc;
  border-radius: 50%;
  transition: transform 0.25s ease;
}

.toggle-switch input:checked + .slider {
  background: linear-gradient(135deg, #7a0f0f, #c21f1f);
}

.toggle-switch input:checked + .slider::before {
  transform: translateX(20px);
  background: white;
}

/* ---------- Lists ---------- */

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
</style>
