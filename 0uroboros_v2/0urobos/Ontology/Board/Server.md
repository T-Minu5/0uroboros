---
kind: concept
category: board
aliases: [Servers, Primary, Backup, Primary server, Backup server, Available server, Data Center, Server VP]
part_of: "[[Player]]"
related: ["[[Server effects]]", "[[Victory Points]]", "[[Game end]]"]
code: src/game.ts (serverMaximums, defaultServerVP, applyServerEffect); src/gameSetup.ts
tags: [ontology/board]
---
# Server

Each [[Player]] has two Servers, shown as glowing gel tubes whose light follows integrity.


| Server  | Max integrity | Destruction award to the attacker (default) |
| ------- | ------------- | ------------------------------------------- |
| Primary | 2000          | +8 VP                                       |
| Backup  | 1500          | +16 VP                                      |


The destruction award is **Server VP**, set per game under Configure on the setup screen (0–50 each). AI test games use the defaults.

## Available server

Effects that don't name a Server hit the **available** one: Primary while it stands, then Backup. Effect targets are Available, Both or Backup (there is no Primary-only target).

## Acted on by

[[Server effects]]: **Drain** (damage), **Repair** (heal, never above max), **Destroy your backup**.

Destroying both of one player's Servers ends the game: [[Game end]]. Self-destruction awards no VP.