# Island Settlers

A single-file, Catan-style board game (`index.html`). Open it in any modern browser. No build step, no server, no dependencies.

## Play
- You are the blue player. Three bots (or two, see the Players selector) play the rest.
- Setup: snake-order placement of 2 settlements and 2 roads each. The second settlement pays out starting resources.
- Turn: roll, collect, then build roads, settlements, cities, and development cards, trade with the bank, play cards, end turn.
- A 7 forces anyone with more than 7 cards to discard half. Then the roller moves the robber and steals.
- First to 10 VP wins. Victory points come from settlements (1), cities (2), Longest Road (2, five or more), Largest Army (2, three or more knights), and Victory Point cards (1, hidden).
- Ports: 4 generic 3:1 and 5 specific 2:1, placed on the coast automatically.
- Player-to-player trading is not included. Bank trades only.

## Development cards
| Card | Count | When | Effect |
|---|---|---|---|
| Knight | 14 | Your turn | Move robber, steal 1 |
| Victory Point | 5 | Hidden | +1 VP |
| Road Building | 2 | Your turn | Two free roads |
| Year of Plenty | 2 | Your turn | Take any 2 from the bank |
| Monopoly | 2 | Your turn | Take all of one resource from everyone |
| **Ward (new)** | 2 | **Any time** | Immune to the next 7-roll discard. Consumed when it blocks a discard, or it stays until the next 7. One use. |
| **Pickpocket (new)** | 2 | **Any time** | Steal 1 random card from an opponent you choose |
| **Blessing of the Harvest (new)** | 2 | Your turn | Name a number 2-12 (not 7). The next time it is rolled, you collect +1 resource per building on those tiles. Consumed on trigger. |

"Any time" cards can be played on other players' turns, as long as no discard, robber, or other choice is pending. One non-"any time" card per turn. Cards bought this turn can't be played until your next turn, except "any time" cards.

## Configure
Everything tunable is in the `CONFIG` object at the top of the script: target VP, piece limits, tile counts, number tokens, bank supply, discard limit, award thresholds, bot trade cap, and the development deck mix.

## Notes
- The board is fixed at 19 hexes (radius 2).
- Bots use simple heuristics: they prefer high-probability intersections, buy cities first, and rob the leader.
