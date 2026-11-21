# Hexhaven: a Catan-style board game

A single-file, dependency-free board game for one human against 2 or 3 bots. It is vanilla HTML, JS and SVG with no build step.

**Play:** open `catan/index.html` in a browser. Pick 3 or 4 players and the bot speed in the header, then click **New game**.

## Rules

### Board
- A radius-2 hex board of 19 tiles: 4 wood, 3 brick, 4 wool, 4 grain, 3 ore and 1 desert.
- Number tokens `2 3 3 4 4 5 5 6 6 8 8 9 9 10 10 11 11 12` go on the 18 land tiles. They are reshuffled until no 6 or 8 is next to another 6 or 8.
- The robber starts on the desert.
- 9 ports sit on coastal edges, evenly spaced (3 or 4 edges apart): 4 generic **3:1** ports and 5 specific **2:1** ports, one per resource.

### Setup
Placement runs in snake order (1-2-3-4-4-3-2-1). Each player places a settlement and then a road attached to it, twice. The **second** settlement pays one of each resource on its adjacent tiles.

### Turn
1. **Roll.** Every settlement on a tile with the rolled number gets 1 of its resource, and every city gets 2. The robber's tile produces nothing.
   - **Bank shortage:** if total demand for a resource is more than the bank holds, nobody gets that resource on this roll.
2. **Rolling a 7:** each player holding more than 7 cards discards half, rounded down, unless a Ward protects them. The roller then moves the robber and steals one random card from a player with a building on the new tile. If several players qualify, the roller picks one.
3. **Build, buy, trade, and play cards** in any order, then end the turn.

| Build | Cost | Limit |
|---|---|---|
| Road | 🌲 wood + 🧱 brick | 15 |
| Settlement | 🌲 + 🧱 + 🐑 wool + 🌾 grain | 5 |
| City (upgrades a settlement) | 🌾🌾 + ⛰️⛰️⛰️ | 4 |
| Development card | 🐑 + 🌾 + ⛰️ | deck of 31 |

- **Distance rule:** no settlement can be next to another settlement or city.
- New roads must connect to your own road or building. An opponent's building on an intersection blocks your roads there, and it splits your road for Longest Road.
- **Bank trade** is 4:1. A 3:1 port gives you 3:1 for any resource, and a 2:1 port gives you 2:1 for its resource. There is no trading between players.

### Awards and winning
- **Longest Road:** the first player with an unbroken road of 5 or more segments gets it (+2 VP). Another player takes it only by building a strictly longer road; ties keep the holder. If the holder's road is broken, the award goes to the single longest road of 5 or more. If that road is tied or no road reaches 5, nobody holds it.
- **Largest Army:** the first player to play 3 Knights gets it (+2 VP). Another player takes it only by playing strictly more Knights.
- The first player to reach **10 VP** on their own turn wins. Hidden VP cards count toward this.

## Development cards

| Card | Count | When | Effect |
|---|---|---|---|
| Knight | 14 | your turn | Move the robber and steal a card. Counts toward Largest Army. |
| Victory Point | 5 | never played | +1 VP, hidden from opponents. Counts automatically. |
| Road Building | 2 | your turn | Place 2 free roads. You can skip the rest. |
| Year of Plenty | 2 | your turn | Take any 2 resources from the bank. |
| Monopoly | 2 | your turn | Name a resource. Every opponent gives you all they hold of it. |
| **Ward** (new) | 2 | **ANY TIME** | Makes you immune to the next 7-discard. It is used up only when it actually blocks a discard, so a 7 rolled while you hold 7 or fewer cards leaves it in place. You can't have two Wards active. |
| **Pickpocket** (new) | 2 | **ANY TIME** | Steal one random card from an opponent you choose. Only opponents holding cards can be chosen. |
| **Blessing of the Harvest** (new) | 2 | your turn | Name a number from 2 to 12, other than 7. The next time it is rolled, you get +1 of that tile's resource for each of your buildings on tiles with that number. The robber's tile gives no bonus. The Blessing is used up when the number is rolled. |

Timing rules:
- **Your turn** cards can be played before or after you roll. You can play only one of them per turn, and not on the turn you bought it.
- **ANY TIME** cards can be played on anyone's turn, including opponents' turns, but only while no choice is pending. A choice is pending during setup, a discard, a robber move or another card's prompt. ANY TIME cards don't count toward the one-card-per-turn limit, and they can't be played on the turn they were bought.

## Bots
- **Setup:** a bot takes the open intersection with the highest pip value. The score also gives small bonuses for resource variety and ports. It then builds its road toward the best spot it can reach next.
- **Turn:**
  1. Play Ward when holding 7 or more cards.
  2. Play Pickpocket when an opponent holds 3 or more cards.
  3. Play one useful card: a Knight if the robber blocks the bot, if it is close to Largest Army, or sometimes at random; otherwise Year of Plenty, Monopoly if it would collect 3 or more, Road Building, or Blessing on its best number.
  4. Build in this order: city, settlement, development card, road. A bot builds roads only when it has no open spot for a settlement.
  5. Trade with the bank at its best rate toward its current goal, up to 3 times per turn.
  6. End the turn.
- **Robber:** a bot moves it to the tile with the most opponent buildings, avoiding its own. It steals from the victim holding the most cards. When it must discard, it gives up its most plentiful resources first.

## Configuration
Every tunable is in the `CONFIG` object at the top of the script in `index.html`:

| Key | Default | Meaning |
|---|---|---|
| `VP_TO_WIN` | 10 | Victory points needed to win |
| `DISCARD_OVER` | 7 | Players holding more than this discard half on a 7 |
| `BANK_PER_RESOURCE` | 19 | Bank stock of each resource |
| `LIMITS` | 15 / 5 / 4 | Roads / settlements / cities per player |
| `COSTS` | see table above | Build and development card costs |
| `TERRAIN`, `NUMBER_TOKENS` | standard | Tile mix and number tokens |
| `PORTS` | 4 generic + 5 specific | Port mix |
| `BANK_RATE`, `GENERIC_PORT_RATE`, `SPECIFIC_PORT_RATE` | 4, 3, 2 | Trade rates |
| `DEV_DECK` | see card table | Count of each development card |
| `ROAD_BUILDING_ROADS`, `YOP_CARDS` | 2, 2 | Card strengths |
| `LONGEST_ROAD_MIN`, `LARGEST_ARMY_MIN`, `AWARD_VP` | 5, 3, 2 | Award thresholds and value |
| `DEFAULT_PLAYERS` | 4 | Player count for a new game (3 or 4) |
| `BOT_SPEED_MS` | slow 1100 / normal 550 / fast 120 | Delay between bot actions |
| `BOT.*` | | Bot thresholds: trades per turn, when to play Ward or Pickpocket, how often to play a Knight at random, the minimum Monopoly haul |
| `HEX_SIZE`, `LOG_MAX` | 60, 300 | Board scale and log length |

## Architecture
- **One state object, `G`.** It holds the board, players, bank, deck, turn, phase, the `pending` decision and its `queue`, the awards and the log.
- **Pure actions.** These are `doSetupSettle`, `doSetupRoad`, `rollDice`, `doRoad`, `doSettle`, `doCity`, `buyDev`, `bankTrade`, `playDev`, `moveRobber`, `doSteal`, `doDiscard`, `chooseYop`, `chooseMono`, `chooseBlessing`, `choosePickpocket`, `skipFreeRoads` and `endTurn`. Each one checks that the move is legal, changes `G`, updates awards, checks for a win, and returns `true` or `false`. The UI calls `render()` afterwards.
- **Pending decisions.** `G.pending` holds the current decision as `{kind, pid, ...}`. Kinds are `setupSettle`, `setupRoad`, `discard`, `robber`, `steal`, `freeRoads`, `yop`, `mono`, `blessing` and `pickpocket`. The same object drives the human's prompt (banner buttons, glowing targets, the discard dialog) and the bot's answer (`botResolve`). A 7 queues the discards and then the robber.
- **Actor.** The actor is `pending.pid` if a decision is pending, and otherwise the player whose turn it is. When the actor is a bot, a scheduler runs one `botAct` per tick at the chosen speed. An ANY TIME card played by the human during a bot's turn sets a pending decision for the human, which pauses the bot until the human chooses.
- **Seeded RNG.** `newGame({seed})` makes a game reproducible.

## Tests
Run from the repository root:

```sh
node --test catan/test/game.test.js      # headless rules + bot simulations
node --test catan/test/browser.test.js   # Chromium smoke test (needs Playwright)
```

- **`game.test.js`** loads the game script from `index.html` into a Node `vm`, with no DOM. It covers:
  - Board generation over 200 seeds: tile counts, tokens, no adjacent 6 or 8, port count and spacing.
  - Snake-order setup and the second-settlement payout.
  - 50 bot-only games, 25 with 3 players and 25 with 4, all played to a win. After every action, the test checks that each resource totals 19 across the bank and all hands.
  - Ward: it blocks a discard and is then used up, it can be played on an opponent's turn, and it is kept when the holder has 7 or fewer cards.
  - Pickpocket steals exactly one card.
  - Blessing pays only its owner and is used up.
  - Longest Road at 5 roads and when broken, Largest Army ties, bank shortage, port rates, building rules, and the one-card-per-turn limit.
- **`browser.test.js`** opens `index.html` in headless Chromium (`/opt/pw-browsers/chromium` with `--no-sandbox` when present). It checks that the board renders 19 tiles and 9 ports, plays the human's setup and first turn by clicking, checks that Esc cancels build mode, and fails on any console error.
